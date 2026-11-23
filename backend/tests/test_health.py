from unittest.mock import patch

from sqlalchemy.exc import OperationalError


def test_health_ok(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "checks": {"database": "ok"}}


def test_health_reports_database_down(client):
    error = OperationalError("SELECT 1", {}, Exception("connection refused"))
    with patch("app.repositories.health_repository.HealthRepository.ping", side_effect=error):
        response = client.get("/api/health")

    assert response.status_code == 503
    assert response.get_json()["checks"]["database"] == "unavailable"


def test_unknown_route_uses_json_error_shape(client):
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
    body = response.get_json()
    assert body["error"]["code"] == "not_found"
    assert set(body["error"]) == {"code", "message", "details"}


def test_proxy_fix_uses_forwarded_client_ip():
    from flask import request

    from app import create_app

    app = create_app("testing", {"TRUSTED_PROXY_COUNT": 1})
    app.add_url_rule("/_ip", "ip", lambda: request.remote_addr or "")

    response = app.test_client().get("/_ip", headers={"X-Forwarded-For": "203.0.113.7"})

    assert response.get_data(as_text=True) == "203.0.113.7"
