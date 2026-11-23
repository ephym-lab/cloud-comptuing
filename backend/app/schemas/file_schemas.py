"""Request validation and response serialization for the file endpoints."""

from marshmallow import Schema, fields, validate

from app.utils.file_types import FileCategory

CATEGORY_VALUES = [category.value for category in FileCategory]


# --- Requests ---


class UploadUrlRequestSchema(Schema):
    filename = fields.String(required=True, validate=validate.Length(min=1, max=255))
    # May be "" — browsers send an empty type for files they don't recognise.
    content_type = fields.String(required=True, validate=validate.Length(max=255))
    size = fields.Integer(required=True, strict=True)


class ConfirmUploadSchema(Schema):
    key = fields.String(required=True, validate=validate.Length(min=1, max=1024))


class ListFilesQuerySchema(Schema):
    category = fields.String(load_default=None, validate=validate.OneOf(CATEGORY_VALUES))


class ShareQuerySchema(Schema):
    minutes = fields.Integer(load_default=10)


# --- Responses ---


class FileSchema(Schema):
    id = fields.UUID()
    original_name = fields.String()
    category = fields.Enum(FileCategory, by_value=True)
    content_type = fields.String()
    size_bytes = fields.Integer()
    s3_key = fields.String()
    created_at = fields.DateTime()
    updated_at = fields.DateTime()


class UploadTicketSchema(Schema):
    """`url` + `fields` are exactly what the browser needs to build the multipart POST."""

    url = fields.String()
    # Named `form_fields` here because `fields` would shadow the marshmallow module.
    form_fields = fields.Dict(attribute="fields", data_key="fields")
    key = fields.String()
    category = fields.Enum(FileCategory, by_value=True)
    content_type = fields.String()
    max_bytes = fields.Integer()
    expires_in = fields.Integer()


class SignedUrlSchema(Schema):
    url = fields.String()
    expires_in = fields.Integer()
    expires_at = fields.DateTime()


class VersionSchema(Schema):
    version_id = fields.String()
    is_latest = fields.Boolean()
    size = fields.Integer()
    last_modified = fields.DateTime()
