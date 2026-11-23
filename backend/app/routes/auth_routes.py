"""Auth endpoints — thin controllers: validate input, call AuthService, shape output.

Sessions use JWTs in httpOnly cookies. Mutating requests from the browser must
send the `X-CSRF-TOKEN` header (value of the readable `csrf_access_token` /
`csrf_refresh_token` cookie): double-submit CSRF protection.
"""

from flask import Blueprint, Response, current_app, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    set_access_cookies,
    set_refresh_cookies,
    unset_jwt_cookies,
)

from app.extensions import limiter
from app.models import User
from app.routes import current_user
from app.schemas import load_json
from app.schemas.auth_schemas import (
    EmailSchema,
    LoginSchema,
    RegisterSchema,
    ResetPasswordSchema,
    TokenSchema,
    UserSchema,
)
from app.services.auth_service import AuthService

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
user_schema = UserSchema()

RESEND_MESSAGE = "If that account exists and is unverified, a new verification email is on its way."
FORGOT_MESSAGE = "If an account exists for that email, a password reset link has been sent."


def auth_rate_limit() -> str:
    return current_app.config["AUTH_RATE_LIMIT"]


def _with_session_cookies(response: Response, user: User) -> Response:
    identity = str(user.id)
    set_access_cookies(response, create_access_token(identity=identity))
    set_refresh_cookies(response, create_refresh_token(identity=identity))
    return response


@auth_bp.post("/register")
@limiter.limit(auth_rate_limit)
def register():
    data = load_json(RegisterSchema())
    user = AuthService().register(**data)
    message = "Account created. Check your email to verify your address."
    return jsonify(message=message, user=user_schema.dump(user)), 201


@auth_bp.post("/verify-email")
def verify_email():
    data = load_json(TokenSchema())
    user = AuthService().verify_email(data["token"])
    return jsonify(message="Email verified. You can now log in.", user=user_schema.dump(user))


@auth_bp.post("/resend-verification")
@limiter.limit(auth_rate_limit)
def resend_verification():
    data = load_json(EmailSchema())
    AuthService().resend_verification(data["email"])
    return jsonify(message=RESEND_MESSAGE)


@auth_bp.post("/login")
@limiter.limit(auth_rate_limit)
def login():
    data = load_json(LoginSchema())
    user = AuthService().authenticate(data["email"], data["password"])
    return _with_session_cookies(jsonify(user=user_schema.dump(user)), user)


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    user = current_user()
    response = jsonify(user=user_schema.dump(user))
    set_access_cookies(response, create_access_token(identity=str(user.id)))
    return response


@auth_bp.post("/logout")
def logout():
    response = jsonify(message="Logged out.")
    unset_jwt_cookies(response)
    return response


@auth_bp.get("/me")
@jwt_required()
def me():
    user = current_user()
    return jsonify(user=user_schema.dump(user))


@auth_bp.post("/forgot-password")
@limiter.limit(auth_rate_limit)
def forgot_password():
    data = load_json(EmailSchema())
    AuthService().request_password_reset(data["email"])
    return jsonify(message=FORGOT_MESSAGE)


@auth_bp.post("/reset-password")
def reset_password():
    data = load_json(ResetPasswordSchema())
    AuthService().reset_password(data["token"], data["new_password"])
    return jsonify(message="Password updated. You can now log in.")
