"""File endpoints — thin controllers. Every route requires login, and FileService
checks that the file belongs to the current user."""

import uuid

from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import jwt_required

from app.routes import current_user
from app.schemas import load_json, load_query
from app.schemas.file_schemas import (
    ConfirmUploadSchema,
    FileSchema,
    ListFilesQuerySchema,
    ShareQuerySchema,
    SignedUrlSchema,
    UploadTicketSchema,
    UploadUrlRequestSchema,
    VersionSchema,
)
from app.services.file_service import FileService
from app.utils.file_types import CATEGORY_FOLDERS, FileCategory, allowed_file_types

files_bp = Blueprint("files", __name__, url_prefix="/api/files")

file_schema = FileSchema()
signed_url_schema = SignedUrlSchema()


@files_bp.get("/upload-config")
@jwt_required()
def upload_config():
    """Limits and allowlist, so the frontend can validate before asking for a URL."""
    allowed = allowed_file_types(current_app.config["ALLOWED_EXTENSIONS"])
    categories = {
        category.value: {
            "folder": CATEGORY_FOLDERS[category],
            "extensions": sorted(ext for ext, ft in allowed.items() if ft.category is category),
        }
        for category in FileCategory
    }
    return jsonify(max_upload_mb=current_app.config["MAX_UPLOAD_MB"], categories=categories)


@files_bp.post("/upload-url")
@jwt_required()
def create_upload_url():
    data = load_json(UploadUrlRequestSchema())
    ticket = FileService().create_upload(current_user(), **data)
    return jsonify(UploadTicketSchema().dump(ticket))


@files_bp.post("/confirm")
@jwt_required()
def confirm_upload():
    data = load_json(ConfirmUploadSchema())
    result = FileService().confirm_upload(current_user(), data["key"])
    body = {"file": file_schema.dump(result.file), "is_new_version": result.is_new_version}
    return jsonify(body), 200 if result.is_new_version else 201


@files_bp.get("")
@jwt_required()
def list_files():
    query = load_query(ListFilesQuerySchema())
    category = FileCategory(query["category"]) if query["category"] else None
    files = FileService().list_files(current_user(), category)
    return jsonify(files=file_schema.dump(files, many=True))


@files_bp.get("/stats")
@jwt_required()
def stats():
    totals = FileService().stats(current_user())
    categories = {
        category.value: {"count": t.count, "total_bytes": t.total_bytes}
        for category, t in totals.items()
    }
    total = {
        "count": sum(t.count for t in totals.values()),
        "total_bytes": sum(t.total_bytes for t in totals.values()),
    }
    return jsonify(categories=categories, total=total)


@files_bp.get("/<uuid:file_id>/preview")
@jwt_required()
def preview(file_id: uuid.UUID):
    signed = FileService().preview_url(current_user(), file_id)
    return jsonify(signed_url_schema.dump(signed))


@files_bp.get("/<uuid:file_id>/download")
@jwt_required()
def download(file_id: uuid.UUID):
    signed = FileService().download_url(current_user(), file_id)
    return jsonify(signed_url_schema.dump(signed))


@files_bp.get("/<uuid:file_id>/share")
@jwt_required()
def share(file_id: uuid.UUID):
    query = load_query(ShareQuerySchema())
    signed = FileService().share_url(current_user(), file_id, query["minutes"])
    return jsonify(signed_url_schema.dump(signed))


@files_bp.get("/<uuid:file_id>/direct-url")
@jwt_required()
def direct_url(file_id: uuid.UUID):
    url = FileService().direct_url(current_user(), file_id)
    note = "Unsigned URL to a private bucket: opening it returns 403 Access Denied."
    return jsonify(url=url, note=note)


@files_bp.get("/<uuid:file_id>/versions")
@jwt_required()
def list_versions(file_id: uuid.UUID):
    versions = FileService().list_versions(current_user(), file_id)
    return jsonify(versions=VersionSchema().dump(versions, many=True))


@files_bp.post("/<uuid:file_id>/versions/<string:version_id>/restore")
@jwt_required()
def restore_version(file_id: uuid.UUID, version_id: str):
    result = FileService().restore_version(current_user(), file_id, version_id)
    return jsonify(
        file=file_schema.dump(result.file),
        restored_version_id=result.restored_version_id,
        new_version_id=result.new_version_id,
    )


@files_bp.delete("/<uuid:file_id>")
@jwt_required()
def delete_file(file_id: uuid.UUID):
    FileService().delete_file(current_user(), file_id)
    return "", 204
