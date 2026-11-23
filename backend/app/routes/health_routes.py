"""Health check endpoint, used by Docker Compose and for a quick sanity check."""

from flask import Blueprint, jsonify

from app.services.health_service import HealthService

health_bp = Blueprint("health", __name__, url_prefix="/api")


@health_bp.get("/health")
def health():
    status = HealthService().check()
    body = {
        "status": "ok" if status.healthy else "degraded",
        "checks": {"database": "ok" if status.database_ok else "unavailable"},
    }
    return jsonify(body), 200 if status.healthy else 503
