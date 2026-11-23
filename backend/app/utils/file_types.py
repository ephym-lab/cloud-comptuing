"""Which files may be uploaded, and which category / S3 "folder" each one goes to.

The backend decides the category from the file extension and checks that the
browser-reported MIME type is consistent with it — the client is never trusted alone.
The Content-Type stored in S3 is always our canonical one, so previews play correctly.
"""

from dataclasses import dataclass
from enum import StrEnum


class FileCategory(StrEnum):
    VIDEO = "video"
    AUDIO = "audio"
    IMAGE = "image"
    DOCUMENT = "document"
    OTHER = "other"


# S3 has no real folders: these are just key prefixes, e.g. users/<id>/videos/clip.mp4
CATEGORY_FOLDERS: dict[FileCategory, str] = {
    FileCategory.VIDEO: "videos",
    FileCategory.AUDIO: "audio",
    FileCategory.IMAGE: "images",
    FileCategory.DOCUMENT: "documents",
    FileCategory.OTHER: "other",
}

# Browsers send these when they don't know the type; we then use our canonical MIME type.
GENERIC_MIME_TYPES = frozenset({"", "application/octet-stream"})


@dataclass(frozen=True)
class FileType:
    extension: str
    category: FileCategory
    mime_types: tuple[str, ...]  # first entry is the canonical Content-Type

    @property
    def content_type(self) -> str:
        return self.mime_types[0]

    @property
    def folder(self) -> str:
        return CATEGORY_FOLDERS[self.category]

    def accepts(self, client_mime_type: str) -> bool:
        mime = client_mime_type.split(";")[0].strip().lower()
        return mime in GENERIC_MIME_TYPES or mime in self.mime_types


def _types(category: FileCategory, entries: dict[str, tuple[str, ...]]) -> dict[str, FileType]:
    return {ext: FileType(ext, category, mimes) for ext, mimes in entries.items()}


_OFFICE = "application/vnd.openxmlformats-officedocument"

FILE_TYPES: dict[str, FileType] = {
    **_types(
        FileCategory.VIDEO,
        {
            "mp4": ("video/mp4",),
            "webm": ("video/webm",),
            "mov": ("video/quicktime",),
        },
    ),
    **_types(
        FileCategory.AUDIO,
        {
            "mp3": ("audio/mpeg", "audio/mp3"),
            "wav": ("audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"),
            "ogg": ("audio/ogg", "application/ogg", "video/ogg"),
            "m4a": ("audio/mp4", "audio/x-m4a", "audio/m4a"),
        },
    ),
    **_types(
        FileCategory.IMAGE,
        {
            "jpg": ("image/jpeg",),
            "jpeg": ("image/jpeg",),
            "png": ("image/png",),
            "gif": ("image/gif",),
            "webp": ("image/webp",),
        },
    ),
    **_types(
        FileCategory.DOCUMENT,
        {
            "pdf": ("application/pdf",),
            "txt": ("text/plain",),
            "docx": (f"{_OFFICE}.wordprocessingml.document",),
            "xlsx": (f"{_OFFICE}.spreadsheetml.sheet",),
            "pptx": (f"{_OFFICE}.presentationml.presentation",),
            "csv": ("text/csv", "application/vnd.ms-excel", "text/plain"),
        },
    ),
    **_types(
        FileCategory.OTHER,
        {
            "zip": ("application/zip", "application/x-zip-compressed", "application/x-zip"),
        },
    ),
}


def extension_of(filename: str) -> str:
    _, dot, ext = filename.rpartition(".")
    return ext.lower() if dot else ""


def allowed_file_types(allowed_extensions: tuple[str, ...] = ()) -> dict[str, FileType]:
    """All known types, optionally narrowed by the ALLOWED_EXTENSIONS setting."""
    if not allowed_extensions:
        return FILE_TYPES
    return {ext: ft for ext, ft in FILE_TYPES.items() if ext in allowed_extensions}
