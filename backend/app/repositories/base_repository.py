"""Shared persistence helpers.

Repositories stage changes with `add`; the service decides when a unit of work is
complete and calls `commit`, so multi-step operations are saved atomically.
"""

from app.extensions import db


class BaseRepository:
    def add(self, entity: db.Model) -> None:
        db.session.add(entity)

    def commit(self) -> None:
        db.session.commit()

    def rollback(self) -> None:
        db.session.rollback()
