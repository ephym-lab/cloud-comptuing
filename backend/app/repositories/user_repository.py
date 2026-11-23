import uuid

from sqlalchemy import select

from app.extensions import db
from app.models import User
from app.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository):
    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return db.session.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        return db.session.scalar(select(User).where(User.email == email))
