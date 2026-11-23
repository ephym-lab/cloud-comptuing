import uuid
from datetime import datetime

from sqlalchemy import select, update

from app.extensions import db
from app.models import AuthToken, TokenPurpose
from app.repositories.base_repository import BaseRepository


class AuthTokenRepository(BaseRepository):
    def get_by_hash(self, token_hash: str, purpose: TokenPurpose) -> AuthToken | None:
        return db.session.scalar(
            select(AuthToken).where(
                AuthToken.token_hash == token_hash, AuthToken.purpose == purpose
            )
        )

    def mark_unused_as_used(self, user_id: uuid.UUID, purpose: TokenPurpose, at: datetime) -> None:
        """Invalidate every outstanding token of this purpose for the user."""
        db.session.execute(
            update(AuthToken)
            .where(
                AuthToken.user_id == user_id,
                AuthToken.purpose == purpose,
                AuthToken.used_at.is_(None),
            )
            .values(used_at=at)
        )
