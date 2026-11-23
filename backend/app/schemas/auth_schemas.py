"""Request validation and response serialization for the auth endpoints."""

import re
from typing import Any

from marshmallow import Schema, ValidationError, fields, pre_load, validate

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


def validate_password(value: str) -> None:
    errors = []
    if len(value) < PASSWORD_MIN_LENGTH:
        errors.append(f"Must be at least {PASSWORD_MIN_LENGTH} characters.")
    if len(value) > PASSWORD_MAX_LENGTH:
        errors.append(f"Must be at most {PASSWORD_MAX_LENGTH} characters.")
    if not re.search(r"[A-Za-z]", value):
        errors.append("Must contain at least one letter.")
    if not re.search(r"\d", value):
        errors.append("Must contain at least one number.")
    if errors:
        raise ValidationError(errors)


class _NormalizeEmailMixin:
    """Trim whitespace and lowercase the email so lookups are case-insensitive."""

    @pre_load
    def normalize(self, data: Any, **_kwargs: Any) -> Any:
        if isinstance(data, dict):
            data = dict(data)
            if isinstance(data.get("email"), str):
                data["email"] = data["email"].strip().lower()
            if isinstance(data.get("name"), str):
                data["name"] = data["name"].strip()
        return data


class RegisterSchema(_NormalizeEmailMixin, Schema):
    name = fields.String(required=True, validate=validate.Length(min=1, max=100))
    email = fields.Email(required=True, validate=validate.Length(max=255))
    password = fields.String(required=True, load_only=True, validate=validate_password)


class LoginSchema(_NormalizeEmailMixin, Schema):
    email = fields.Email(required=True)
    password = fields.String(required=True, load_only=True)


class EmailSchema(_NormalizeEmailMixin, Schema):
    email = fields.Email(required=True)


class TokenSchema(Schema):
    token = fields.String(required=True, validate=validate.Length(min=1, max=256))


class ResetPasswordSchema(Schema):
    token = fields.String(required=True, validate=validate.Length(min=1, max=256))
    new_password = fields.String(required=True, load_only=True, validate=validate_password)


class UserSchema(Schema):
    id = fields.UUID()
    name = fields.String()
    email = fields.Email()
    is_verified = fields.Boolean()
    created_at = fields.DateTime()
