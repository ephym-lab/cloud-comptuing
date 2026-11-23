"""Shared pytest fixtures and helpers: a fresh app + database for every test."""

import re
from collections.abc import Iterator

import pytest
from flask import Flask
from flask.testing import FlaskClient

from app import create_app
from app.extensions import db
from app.services.email_service import EXTENSION_KEY, MemoryEmailSender

DEFAULT_PASSWORD = "secret123"


@pytest.fixture
def app() -> Iterator[Flask]:
    app = create_app("testing")
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app: Flask) -> FlaskClient:
    return app.test_client()


@pytest.fixture
def outbox(app: Flask) -> list:
    """Emails "sent" during the test (nothing leaves the machine)."""
    sender = app.extensions[EXTENSION_KEY]
    assert isinstance(sender, MemoryEmailSender)
    return sender.outbox


def token_from_email(email) -> str:
    match = re.search(r"token=([\w-]+)", email.text_body)
    assert match, "no token link found in email"
    return match.group(1)


def register(client: FlaskClient, email: str = "ada@example.com", password: str = DEFAULT_PASSWORD):
    return client.post(
        "/api/auth/register", json={"name": "Ada", "email": email, "password": password}
    )


def login(client: FlaskClient, email: str = "ada@example.com", password: str = DEFAULT_PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def register_and_verify(client: FlaskClient, outbox: list, email: str = "ada@example.com") -> None:
    assert register(client, email).status_code == 201
    token = token_from_email(outbox[-1])
    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 200


def csrf_header(client: FlaskClient, cookie_name: str = "csrf_access_token") -> dict[str, str]:
    cookie = client.get_cookie(cookie_name)
    assert cookie is not None, f"{cookie_name} cookie missing"
    return {"X-CSRF-TOKEN": cookie.value}
