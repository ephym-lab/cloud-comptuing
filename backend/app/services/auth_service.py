"""Authentication business rules: registration, email verification, login,
password reset. Routes call this; it calls repositories and the email service."""

import uuid
from datetime import datetime, timedelta

from flask import current_app

from app.models import AuthToken, TokenPurpose, User
from app.repositories.auth_token_repository import AuthTokenRepository
from app.repositories.user_repository import UserRepository
from app.services.email_service import EmailService
from app.utils.errors import ConflictError, ForbiddenError, UnauthorizedError, ValidationError
from app.utils.security import (
    dummy_password_hash,
    generate_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.utils.time import ensure_aware, utcnow

INVALID_LINK_MESSAGE = "This link is invalid or has expired. Please request a new one."


class AuthService:
    def __init__(
        self,
        users: UserRepository | None = None,
        tokens: AuthTokenRepository | None = None,
        email: EmailService | None = None,
    ) -> None:
        self._users = users or UserRepository()
        self._tokens = tokens or AuthTokenRepository()
        self._email = email or EmailService()

    # --- Registration & verification ---

    def register(self, name: str, email: str, password: str) -> User:
        if self._users.get_by_email(email):
            raise ConflictError(
                "An account with this email already exists.", {"fields": {"email": ["taken"]}}
            )
        user = User(name=name, email=email, password_hash=hash_password(password))
        self._users.add(user)
        raw_token = self._issue_token(user, TokenPurpose.VERIFY_EMAIL)
        self._users.commit()

        self._email.send_verification_email(user, raw_token)
        return user

    def verify_email(self, raw_token: str) -> User:
        token = self._consume_token(raw_token, TokenPurpose.VERIFY_EMAIL)
        token.user.is_verified = True
        self._tokens.commit()
        return token.user

    def resend_verification(self, email: str) -> None:
        """Silently does nothing for unknown or already-verified emails."""
        user = self._users.get_by_email(email)
        if not user or user.is_verified:
            return
        raw_token = self._issue_token(user, TokenPurpose.VERIFY_EMAIL)
        self._tokens.commit()
        self._email.send_verification_email(user, raw_token)

    # --- Login ---

    def authenticate(self, email: str, password: str) -> User:
        user = self._users.get_by_email(email)
        # Always run a hash check so response time doesn't reveal whether the email exists.
        password_hash = user.password_hash if user else dummy_password_hash()
        password_ok = verify_password(password_hash, password)

        if not user or not password_ok:
            raise UnauthorizedError("Invalid email or password.", code="invalid_credentials")
        if not user.is_verified:
            raise ForbiddenError(
                "Please verify your email before logging in.", code="email_not_verified"
            )
        return user

    def get_user(self, user_id: str) -> User:
        """Load the user behind a JWT identity; unknown users count as logged out."""
        try:
            user = self._users.get_by_id(uuid.UUID(user_id))
        except ValueError:
            user = None
        if not user:
            raise UnauthorizedError("Authentication required.")
        return user

    # --- Password reset ---

    def request_password_reset(self, email: str) -> None:
        """Silently does nothing for unknown emails (no account enumeration)."""
        user = self._users.get_by_email(email)
        if not user:
            return
        raw_token = self._issue_token(user, TokenPurpose.RESET_PASSWORD)
        self._tokens.commit()
        self._email.send_password_reset_email(user, raw_token)

    def reset_password(self, raw_token: str, new_password: str) -> User:
        token = self._consume_token(raw_token, TokenPurpose.RESET_PASSWORD)
        user = token.user
        user.password_hash = hash_password(new_password)
        # Clicking the emailed link proves the user owns the address.
        user.is_verified = True
        self._tokens.mark_unused_as_used(user.id, TokenPurpose.RESET_PASSWORD, utcnow())
        self._tokens.commit()
        return user

    # --- Token helpers ---

    def _issue_token(self, user: User, purpose: TokenPurpose) -> str:
        """Create a new token (invalidating older ones of the same purpose).
        Returns the raw token; only its hash is stored."""
        now = utcnow()
        if user.id is not None:
            self._tokens.mark_unused_as_used(user.id, purpose, now)

        raw_token = generate_token()
        self._tokens.add(
            AuthToken(
                user=user,
                token_hash=hash_token(raw_token),
                purpose=purpose,
                expires_at=now + self._ttl(purpose),
            )
        )
        return raw_token

    def _consume_token(self, raw_token: str, purpose: TokenPurpose) -> AuthToken:
        """Validate a token and mark it used (single use). Caller commits."""
        token = self._tokens.get_by_hash(hash_token(raw_token), purpose)
        now = utcnow()
        if not token or token.used_at is not None or _is_expired(token.expires_at, now):
            raise ValidationError(INVALID_LINK_MESSAGE, code="invalid_token")
        token.used_at = now
        return token

    @staticmethod
    def _ttl(purpose: TokenPurpose) -> timedelta:
        if purpose is TokenPurpose.VERIFY_EMAIL:
            return current_app.config["VERIFY_EMAIL_TOKEN_TTL"]
        return current_app.config["RESET_PASSWORD_TOKEN_TTL"]


def _is_expired(expires_at: datetime, now: datetime) -> bool:
    return ensure_aware(expires_at) <= now
