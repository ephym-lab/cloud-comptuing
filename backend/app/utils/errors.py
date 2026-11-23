"""Custom exceptions and the single place where errors become JSON.

Every error response has the same shape:
    {"error": {"code": "...", "message": "...", "details": {...}}}
"""

import logging
from typing import Any

from flask import Flask, Response, jsonify
from marshmallow import ValidationError as MarshmallowValidationError
from werkzeug.exceptions import HTTPException

from app.extensions import jwt

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base class for errors we raise on purpose. Subclasses set status + code."""

    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


def error_response(
    status_code: int, code: str, message: str, details: dict[str, Any] | None = None
) -> tuple[Response, int]:
    body = {"error": {"code": code, "message": message, "details": details or {}}}
    return jsonify(body), status_code


def register_error_handlers(app: Flask) -> None:
    """Convert every kind of exception into the consistent JSON error shape."""

    @app.errorhandler(AppError)
    def handle_app_error(err: AppError):
        return error_response(err.status_code, err.code, err.message, err.details)

    @app.errorhandler(MarshmallowValidationError)
    def handle_schema_error(err: MarshmallowValidationError):
        return error_response(
            422, "validation_error", "Invalid request data.", {"fields": err.messages}
        )

    @app.errorhandler(HTTPException)
    def handle_http_error(err: HTTPException):
        code = (err.name or "http_error").lower().replace(" ", "_")
        return error_response(err.code or 500, code, err.description or err.name)

    @app.errorhandler(Exception)
    def handle_unexpected_error(err: Exception):
        logger.exception("Unhandled exception")
        return error_response(500, "internal_error", "An unexpected error occurred.")

    _register_jwt_handlers()


def _register_jwt_handlers() -> None:
    """flask-jwt-extended has its own callbacks; route them into the same JSON shape."""

    @jwt.unauthorized_loader
    def missing_token(reason: str):
        return error_response(401, "unauthorized", "Authentication required.", {"reason": reason})

    @jwt.invalid_token_loader
    def invalid_token(reason: str):
        return error_response(401, "invalid_token", "Invalid token.", {"reason": reason})

    @jwt.expired_token_loader
    def expired_token(_header: dict, _payload: dict):
        return error_response(401, "token_expired", "Your session has expired.")

    @jwt.revoked_token_loader
    def revoked_token(_header: dict, _payload: dict):
        return error_response(401, "token_revoked", "This token has been revoked.")
