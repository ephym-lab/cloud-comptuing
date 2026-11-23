"""File business rules: what may be uploaded, where it goes in S3, who may access it.

Upload is a three-step dance so file bytes never pass through Flask:
  1. create_upload  → validate, build the key, return a presigned POST
  2. (browser POSTs the file straight to S3)
  3. confirm_upload → check S3 really has it, then save/update the metadata row
"""

import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import quote, unquote

from flask import current_app
from werkzeug.utils import secure_filename

from app.models import File, User
from app.repositories.file_repository import CategoryTotals, FileRepository
from app.services.storage_service import ObjectInfo, ObjectVersion, StorageService
from app.utils.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.utils.file_types import FileCategory, FileType, allowed_file_types, extension_of
from app.utils.time import utcnow

ORIGINAL_NAME_METADATA = "original-name"  # stored on the S3 object as x-amz-meta-original-name
MAX_ORIGINAL_NAME_LENGTH = 255


@dataclass(frozen=True)
class UploadTicket:
    url: str
    fields: dict[str, str]
    key: str
    category: FileCategory
    content_type: str
    max_bytes: int
    expires_in: int


@dataclass(frozen=True)
class SignedUrl:
    url: str
    expires_in: int
    expires_at: datetime


@dataclass(frozen=True)
class ConfirmResult:
    file: File
    is_new_version: bool  # True when the key already existed (S3 kept the old version)


@dataclass(frozen=True)
class RestoreResult:
    file: File
    restored_version_id: str
    new_version_id: str


class FileService:
    def __init__(
        self, files: FileRepository | None = None, storage: StorageService | None = None
    ) -> None:
        self._files = files or FileRepository()
        self._storage = storage or StorageService()

    # --- Upload ---

    def create_upload(
        self, user: User, filename: str, content_type: str, size: int
    ) -> UploadTicket:
        file_type = self._resolve_file_type(filename, content_type)
        self._check_size(size)
        safe_name = self._safe_filename(filename)
        key = build_key(user.id, file_type, safe_name)
        expires_in = current_app.config["PRESIGNED_POST_EXPIRY_SECONDS"]
        original_name = filename.strip()[:MAX_ORIGINAL_NAME_LENGTH]

        post = self._storage.create_presigned_post(
            key=key,
            content_type=file_type.content_type,
            max_bytes=self._max_bytes(),
            expires_in=expires_in,
            # S3 metadata must be ASCII, so the name is URL-encoded.
            metadata={ORIGINAL_NAME_METADATA: quote(original_name)},
        )
        return UploadTicket(
            url=post.url,
            fields=post.fields,
            key=key,
            category=file_type.category,
            content_type=file_type.content_type,
            max_bytes=self._max_bytes(),
            expires_in=expires_in,
        )

    def confirm_upload(self, user: User, key: str) -> ConfirmResult:
        file_type, safe_name = self._parse_owned_key(user, key)
        info = self._storage.head_object(key)
        if info is None:
            raise NotFoundError(
                "The file was not found in S3. Upload it first.", code="upload_not_found"
            )

        original_name = _original_name(info, fallback=safe_name)
        file = self._files.get_by_key(key)
        is_new_version = file is not None
        if file is None:
            file = File(user_id=user.id, s3_key=key, category=file_type.category)
            self._files.add(file)
        _apply_object_info(file, info, original_name)
        self._files.commit()
        return ConfirmResult(file=file, is_new_version=is_new_version)

    # --- Reading ---

    def list_files(self, user: User, category: FileCategory | None = None) -> list[File]:
        return self._files.list_for_user(user.id, category)

    def stats(self, user: User) -> dict[FileCategory, CategoryTotals]:
        """Totals for every category, including empty ones."""
        totals = self._files.totals_by_category(user.id)
        empty = CategoryTotals(count=0, total_bytes=0)
        return {category: totals.get(category, empty) for category in FileCategory}

    def get_owned_file(self, user: User, file_id: uuid.UUID) -> File:
        """Another user's file looks exactly like a missing one (404), so IDs can't be probed."""
        file = self._files.get_by_id(file_id)
        if file is None or file.user_id != user.id:
            raise NotFoundError("File not found.")
        return file

    # --- Signed links ---

    def preview_url(self, user: User, file_id: uuid.UUID) -> SignedUrl:
        file = self.get_owned_file(user, file_id)
        expires_in = current_app.config["PRESIGNED_URL_EXPIRY_SECONDS"]
        return self._signed_get(file, "inline", expires_in)

    def download_url(self, user: User, file_id: uuid.UUID) -> SignedUrl:
        file = self.get_owned_file(user, file_id)
        expires_in = current_app.config["PRESIGNED_URL_EXPIRY_SECONDS"]
        return self._signed_get(file, "attachment", expires_in)

    def share_url(self, user: User, file_id: uuid.UUID, minutes: int) -> SignedUrl:
        max_minutes = current_app.config["SHARE_LINK_MAX_MINUTES"]
        if not 1 <= minutes <= max_minutes:
            raise ValidationError(f"Share links can last between 1 and {max_minutes} minutes.")
        file = self.get_owned_file(user, file_id)
        return self._signed_get(file, "inline", minutes * 60)

    def direct_url(self, user: User, file_id: uuid.UUID) -> str:
        file = self.get_owned_file(user, file_id)
        return self._storage.direct_url(file.s3_key)

    # --- Versions ---

    def list_versions(self, user: User, file_id: uuid.UUID) -> list[ObjectVersion]:
        file = self.get_owned_file(user, file_id)
        return self._storage.list_versions(file.s3_key)

    def restore_version(self, user: User, file_id: uuid.UUID, version_id: str) -> RestoreResult:
        file = self.get_owned_file(user, file_id)
        versions = {v.version_id: v for v in self._storage.list_versions(file.s3_key)}
        version = versions.get(version_id)
        if version is None:
            raise NotFoundError("Version not found for this file.")
        if version.is_latest:
            raise ConflictError("This version is already the current one.")

        new_version_id = self._storage.restore_version(file.s3_key, version_id)
        info = self._storage.head_object(file.s3_key)
        if info is not None:
            _apply_object_info(file, info, _original_name(info, fallback=file.original_name))
        self._files.commit()
        return RestoreResult(
            file=file, restored_version_id=version_id, new_version_id=new_version_id
        )

    # --- Delete ---

    def delete_file(self, user: User, file_id: uuid.UUID) -> None:
        """S3 first: if it fails, the row stays and the user can retry."""
        file = self.get_owned_file(user, file_id)
        self._storage.delete_object(file.s3_key)
        self._files.delete(file)
        self._files.commit()

    # --- Helpers ---

    def _resolve_file_type(self, filename: str, content_type: str) -> FileType:
        allowed = allowed_file_types(current_app.config["ALLOWED_EXTENSIONS"])
        extension = extension_of(filename)
        file_type = allowed.get(extension)
        if file_type is None:
            raise ValidationError(
                f"Files of type '.{extension or '?'}' are not allowed.",
                {"allowed_extensions": sorted(allowed)},
                code="unsupported_file_type",
            )
        if not file_type.accepts(content_type):
            raise ValidationError(
                f"Content type '{content_type}' does not match a .{extension} file.",
                {"expected": list(file_type.mime_types)},
                code="unsupported_file_type",
            )
        return file_type

    def _check_size(self, size: int) -> None:
        if size < 1:
            raise ValidationError("The file is empty.", code="empty_file")
        if size > self._max_bytes():
            max_mb = current_app.config["MAX_UPLOAD_MB"]
            raise ValidationError(
                f"The file is larger than the {max_mb} MB limit.",
                {"max_bytes": self._max_bytes()},
                code="file_too_large",
            )

    @staticmethod
    def _max_bytes() -> int:
        return current_app.config["MAX_UPLOAD_MB"] * 1024 * 1024

    @staticmethod
    def _safe_filename(filename: str) -> str:
        """`secure_filename` keeps only ASCII letters, digits, '.', '-', '_'. If nothing
        usable is left (e.g. a fully non-Latin name) fall back to a stable hash-based name,
        so re-uploading the same file still maps to the same key (= a new S3 version)."""
        extension = extension_of(filename)
        safe_name = secure_filename(filename)
        if extension_of(safe_name) != extension:
            digest = hashlib.sha256(filename.encode("utf-8")).hexdigest()[:12]
            safe_name = f"file-{digest}.{extension}"
        return safe_name

    def _parse_owned_key(self, user: User, key: str) -> tuple[FileType, str]:
        """Check that `key` is one we could have issued to this user."""
        parts = key.split("/")
        if len(parts) != 4 or parts[0] != "users":
            raise ValidationError("Invalid file key.", code="invalid_key")
        _, owner_id, folder, filename = parts
        if owner_id != str(user.id):
            raise ForbiddenError("You can only confirm uploads in your own folder.")

        file_type = allowed_file_types(current_app.config["ALLOWED_EXTENSIONS"]).get(
            extension_of(filename)
        )
        if file_type is None or folder != file_type.folder or secure_filename(filename) != filename:
            raise ValidationError("Invalid file key.", code="invalid_key")
        return file_type, filename

    def _signed_get(self, file: File, disposition: str, expires_in: int) -> SignedUrl:
        url = self._storage.create_presigned_get(
            key=file.s3_key,
            expires_in=expires_in,
            content_disposition=content_disposition(disposition, file.original_name),
            content_type=file.content_type,
        )
        return SignedUrl(
            url=url, expires_in=expires_in, expires_at=utcnow() + timedelta(seconds=expires_in)
        )


def build_key(user_id: uuid.UUID, file_type: FileType, safe_name: str) -> str:
    """e.g. users/<user_id>/videos/demo.mp4 — the "folders" are just part of the key."""
    return f"users/{user_id}/{file_type.folder}/{safe_name}"


def content_disposition(disposition: str, filename: str) -> str:
    """Header value with an ASCII fallback plus the exact UTF-8 name (RFC 6266)."""
    ascii_name = filename.encode("ascii", "ignore").decode().replace('"', "").strip() or "file"
    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


def _original_name(info: ObjectInfo, fallback: str) -> str:
    raw = info.metadata.get(ORIGINAL_NAME_METADATA)
    return unquote(raw)[:MAX_ORIGINAL_NAME_LENGTH] if raw else fallback


def _apply_object_info(file: File, info: ObjectInfo, original_name: str) -> None:
    file.size_bytes = info.size
    file.content_type = info.content_type
    file.original_name = original_name
    file.updated_at = utcnow()
