"""Health check logic: reports whether the app can reach its dependencies."""

import logging
from dataclasses import dataclass

from sqlalchemy.exc import SQLAlchemyError

from app.repositories.health_repository import HealthRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class HealthStatus:
    database_ok: bool

    @property
    def healthy(self) -> bool:
        return self.database_ok


class HealthService:
    def __init__(self, repository: HealthRepository | None = None) -> None:
        self._repository = repository or HealthRepository()

    def check(self) -> HealthStatus:
        try:
            self._repository.ping()
            return HealthStatus(database_ok=True)
        except SQLAlchemyError:
            logger.exception("Database health check failed")
            return HealthStatus(database_ok=False)
