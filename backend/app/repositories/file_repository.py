import uuid
from dataclasses import dataclass

from sqlalchemy import func, select

from app.extensions import db
from app.models import File
from app.repositories.base_repository import BaseRepository
from app.utils.file_types import FileCategory


@dataclass(frozen=True)
class CategoryTotals:
    count: int
    total_bytes: int


class FileRepository(BaseRepository):
    def get_by_id(self, file_id: uuid.UUID) -> File | None:
        return db.session.get(File, file_id)

    def get_by_key(self, s3_key: str) -> File | None:
        return db.session.scalar(select(File).where(File.s3_key == s3_key))

    def list_for_user(self, user_id: uuid.UUID, category: FileCategory | None = None) -> list[File]:
        query = select(File).where(File.user_id == user_id)
        if category:
            query = query.where(File.category == category)
        return list(db.session.scalars(query.order_by(File.updated_at.desc())))

    def totals_by_category(self, user_id: uuid.UUID) -> dict[FileCategory, CategoryTotals]:
        rows = db.session.execute(
            select(File.category, func.count(File.id), func.coalesce(func.sum(File.size_bytes), 0))
            .where(File.user_id == user_id)
            .group_by(File.category)
        )
        return {
            category: CategoryTotals(count=count, total_bytes=int(total))
            for category, count, total in rows
        }

    def delete(self, file: File) -> None:
        db.session.delete(file)
