from datetime import timedelta

import pytest
from sqlalchemy import select

from app import create_app
from app.extensions import db
from app.models import AuthToken, TokenPurpose, User
from app.services.email_service import EXTENSION_KEY
from app.utils.time import utcnow
from tests.conftest import (
    DEFAULT_PASSWORD,
    csrf_header,
    login,
    register,
    register_and_verify,
    token_from_email,
)


def _error_code(response) -> str:
    return response.get_json()["error"]["code"]


def _expire_all_tokens() -> None:
    for token in db.session.scalars(select(AuthToken)):
        token.expires_at = utcnow() - timedelta(seconds=1)
    db.session.commit()


# --- Registration ---


def test_register_creates_unverified_user_and_sends_email(client, outbox):
    response = register(client, email="  Ada@Example.COM ")

    assert response.status_code == 201
    user = response.get_json()["user"]
    assert user["email"] == "ada@example.com"
    assert user["is_verified"] is False
    assert "password" not in user and "password_hash" not in user

    assert len(outbox) == 1
    assert outbox[0].to == "ada@example.com"
    assert "http://localhost:3000/verify-email?token=" in outbox[0].text_body
    assert "http://localhost:3000/verify-email?token=" in outbox[0].html_body


def test_register_stores_only_token_hash(client, outbox):
    register(client)
    raw_token = token_from_email(outbox[0])

    stored = db.session.scalars(select(AuthToken)).one()
    assert stored.token_hash != raw_token
    assert len(stored.token_hash) == 64
    assert stored.purpose is TokenPurpose.VERIFY_EMAIL


def test_register_stores_hashed_password(client):
    register(client)

    user = db.session.scalars(select(User)).one()
    assert user.password_hash != DEFAULT_PASSWORD
    assert user.password_hash.startswith("$argon2")


@pytest.mark.parametrize(
    ("password", "expected"),
    [
        ("short1", "at least 8"),
        ("onlyletters", "one number"),
        ("12345678", "one letter"),
    ],
)
def test_register_rejects_weak_password(client, password, expected):
    response = register(client, password=password)

    assert response.status_code == 422
    errors = response.get_json()["error"]["details"]["fields"]["password"]
    assert any(expected in message for message in errors)


def test_register_validates_required_fields_and_email(client):
    response = client.post("/api/auth/register", json={"email": "not-an-email"})

    assert response.status_code == 422
    fields = response.get_json()["error"]["details"]["fields"]
    assert set(fields) == {"name", "email", "password"}


def test_register_rejects_duplicate_email_case_insensitive(client):
    register(client, email="ada@example.com")
    response = register(client, email="ADA@example.com")

    assert response.status_code == 409
    assert _error_code(response) == "conflict"


def test_register_succeeds_even_if_email_sending_fails(app, client):
    class BrokenSender:
        def send(self, _email):
            raise ConnectionError("SMTP down")

    app.extensions[EXTENSION_KEY] = BrokenSender()
    response = register(client)

    assert response.status_code == 201


# --- Email verification ---


def test_unverified_user_cannot_log_in(client):
    register(client)
    response = login(client)

    assert response.status_code == 403
    assert _error_code(response) == "email_not_verified"


def test_register_verify_login_flow(client, outbox):
    register(client)
    token = token_from_email(outbox[0])

    verify = client.post("/api/auth/verify-email", json={"token": token})
    assert verify.status_code == 200
    assert verify.get_json()["user"]["is_verified"] is True

    response = login(client)
    assert response.status_code == 200
    assert response.get_json()["user"]["email"] == "ada@example.com"
    assert client.get_cookie("access_token_cookie", path="/api/") is not None
    assert client.get_cookie("csrf_access_token") is not None

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.get_json()["user"]["name"] == "Ada"


def test_session_cookies_are_http_only(client, outbox):
    register_and_verify(client, outbox)
    response = login(client)

    set_cookies = response.headers.getlist("Set-Cookie")
    access = next(c for c in set_cookies if c.startswith("access_token_cookie="))
    csrf = next(c for c in set_cookies if c.startswith("csrf_access_token="))
    assert "HttpOnly" in access and "SameSite=Lax" in access
    assert "HttpOnly" not in csrf  # the frontend must be able to read it


def test_verification_token_is_single_use(client, outbox):
    register(client)
    token = token_from_email(outbox[0])

    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 200
    second = client.post("/api/auth/verify-email", json={"token": token})

    assert second.status_code == 422
    assert _error_code(second) == "invalid_token"


def test_expired_verification_token_is_rejected(client, outbox):
    register(client)
    token = token_from_email(outbox[0])
    _expire_all_tokens()

    response = client.post("/api/auth/verify-email", json={"token": token})

    assert response.status_code == 422
    assert _error_code(response) == "invalid_token"


def test_unknown_verification_token_is_rejected(client):
    response = client.post("/api/auth/verify-email", json={"token": "made-up"})

    assert response.status_code == 422
    assert _error_code(response) == "invalid_token"


def test_resend_verification_replaces_old_token(client, outbox):
    register(client)
    old_token = token_from_email(outbox[0])

    response = client.post("/api/auth/resend-verification", json={"email": "ada@example.com"})
    assert response.status_code == 200
    assert len(outbox) == 2
    new_token = token_from_email(outbox[1])

    old = client.post("/api/auth/verify-email", json={"token": old_token})
    assert old.status_code == 422
    assert client.post("/api/auth/verify-email", json={"token": new_token}).status_code == 200


def test_resend_verification_is_generic_for_unknown_and_verified(client, outbox):
    unknown = client.post("/api/auth/resend-verification", json={"email": "nobody@example.com"})
    register_and_verify(client, outbox)
    emails_before = len(outbox)
    verified = client.post("/api/auth/resend-verification", json={"email": "ada@example.com"})

    assert unknown.status_code == verified.status_code == 200
    assert unknown.get_json() == verified.get_json()
    assert len(outbox) == emails_before


# --- Login / session ---


def test_login_wrong_password_and_unknown_email_look_identical(client, outbox):
    register_and_verify(client, outbox)

    wrong_password = login(client, password="wrong-pass1")
    unknown_email = login(client, email="nobody@example.com")

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.get_json() == unknown_email.get_json()
    assert _error_code(wrong_password) == "invalid_credentials"


def test_me_requires_authentication(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert _error_code(response) == "unauthorized"


def test_logout_clears_session(client, outbox):
    register_and_verify(client, outbox)
    login(client)

    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_refresh_requires_csrf_header(client, outbox):
    register_and_verify(client, outbox)
    login(client)

    without_csrf = client.post("/api/auth/refresh")
    with_csrf = client.post("/api/auth/refresh", headers=csrf_header(client, "csrf_refresh_token"))

    assert without_csrf.status_code == 401
    assert with_csrf.status_code == 200
    assert any(
        c.startswith("access_token_cookie=") for c in with_csrf.headers.getlist("Set-Cookie")
    )


# --- Password reset ---


def test_forgot_password_is_generic_for_unknown_email(client, outbox):
    register_and_verify(client, outbox)
    emails_before = len(outbox)

    known = client.post("/api/auth/forgot-password", json={"email": "ada@example.com"})
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})

    assert known.status_code == unknown.status_code == 200
    assert known.get_json() == unknown.get_json()
    assert len(outbox) == emails_before + 1
    assert "/reset-password?token=" in outbox[-1].text_body


def test_reset_password_flow(client, outbox):
    register_and_verify(client, outbox)
    client.post("/api/auth/forgot-password", json={"email": "ada@example.com"})
    token = token_from_email(outbox[-1])

    response = client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "brandnew42"}
    )

    assert response.status_code == 200
    assert login(client).status_code == 401
    assert login(client, password="brandnew42").status_code == 200


def test_reset_token_is_single_use(client, outbox):
    register_and_verify(client, outbox)
    client.post("/api/auth/forgot-password", json={"email": "ada@example.com"})
    token = token_from_email(outbox[-1])
    payload = {"token": token, "new_password": "brandnew42"}

    assert client.post("/api/auth/reset-password", json=payload).status_code == 200
    second = client.post("/api/auth/reset-password", json=payload)

    assert second.status_code == 422
    assert _error_code(second) == "invalid_token"


def test_expired_reset_token_is_rejected(client, outbox):
    register_and_verify(client, outbox)
    client.post("/api/auth/forgot-password", json={"email": "ada@example.com"})
    token = token_from_email(outbox[-1])
    _expire_all_tokens()

    response = client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "brandnew42"}
    )

    assert response.status_code == 422
    assert login(client).status_code == 200  # old password still works


def test_reset_token_ttl_is_30_minutes(client, outbox):
    register_and_verify(client, outbox)
    client.post("/api/auth/forgot-password", json={"email": "ada@example.com"})

    token = db.session.scalars(
        select(AuthToken).where(AuthToken.purpose == TokenPurpose.RESET_PASSWORD)
    ).one()
    ttl = token.expires_at - token.created_at
    assert ttl == pytest.approx(timedelta(minutes=30), abs=timedelta(seconds=5))


def test_reset_password_validates_new_password(client):
    response = client.post(
        "/api/auth/reset-password", json={"token": "whatever", "new_password": "weak"}
    )

    assert response.status_code == 422
    assert "new_password" in response.get_json()["error"]["details"]["fields"]


# --- Rate limiting ---


def test_login_is_rate_limited():
    app = create_app("testing", {"RATELIMIT_ENABLED": True, "AUTH_RATE_LIMIT": "3 per minute"})
    with app.app_context():
        db.create_all()
        client = app.test_client()
        responses = [login(client) for _ in range(4)]
        db.drop_all()

    assert [r.status_code for r in responses] == [401, 401, 401, 429]
    assert _error_code(responses[3]) == "too_many_requests"
