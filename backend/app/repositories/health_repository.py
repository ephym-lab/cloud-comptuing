"""Database access used by the health check."""

from sqlalchemy import text

from app.extensions import db


class HealthRepository:
    def ping(self) -> None:
        """Run a trivial query; raises if the database is unreachable."""
        db.session.execute(text("SELECT 1"))
