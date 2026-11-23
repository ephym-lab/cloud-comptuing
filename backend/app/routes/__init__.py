from flask_jwt_extended import get_jwt_identity

from app.models import User
from app.services.auth_service import AuthService


def current_user() -> User:
    """The logged-in user. Call only inside a `@jwt_required()` route."""
    return AuthService().get_user(get_jwt_identity())
