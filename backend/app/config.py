"""Configuration classes.

Every value is read from the environment so no secret ever lives in the code.
`create_app` picks one of these classes based on the `FLASK_ENV` variable.
"""

import os
from datetime import timedelta

from dotenv import load_dotenv

# Load backend/.env for local (non-Docker) runs. Docker Compose injects env vars directly.
load_dotenv()


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _env_list(name: str) -> tuple[str, ...]:
    raw = os.getenv(name, "")
    return tuple(item.strip().lower() for item in raw.split(",") if item.strip())


class BaseConfig:
    SECRET_KEY = os.getenv("SECRET_KEY", "")
    TESTING = False

    # --- Database ---
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "")
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    # --- JWT in httpOnly cookies with CSRF double-submit protection ---
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=7)
    JWT_COOKIE_SAMESITE = "Lax"
    JWT_COOKIE_SECURE = False
    JWT_COOKIE_CSRF_PROTECT = True
    JWT_ACCESS_COOKIE_PATH = "/api/"
    JWT_REFRESH_COOKIE_PATH = "/api/auth/refresh"

    # --- One-time email tokens ---
    VERIFY_EMAIL_TOKEN_TTL = timedelta(hours=24)
    RESET_PASSWORD_TOKEN_TTL = timedelta(minutes=30)

    # --- Rate limiting ---
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_ENABLED = True
    AUTH_RATE_LIMIT = os.getenv("AUTH_RATE_LIMIT", "5 per minute")

    # --- AWS / S3 ---
    AWS_REGION = os.getenv("AWS_REGION", "")
    S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "")
    PRESIGNED_URL_EXPIRY_SECONDS = _env_int("PRESIGNED_URL_EXPIRY_SECONDS", 60)
    PRESIGNED_POST_EXPIRY_SECONDS = 5 * 60
    SHARE_LINK_MAX_MINUTES = 60
    MAX_UPLOAD_MB = _env_int("MAX_UPLOAD_MB", 100)
    # Comma-separated extensions to allow (e.g. "mp4,png,pdf"). Empty = full built-in allowlist.
    ALLOWED_EXTENSIONS = _env_list("ALLOWED_EXTENSIONS")

    # --- Email (Gmail SMTP) ---
    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = _env_int("MAIL_PORT", 587)
    MAIL_USE_TLS = _env_bool("MAIL_USE_TLS", True)
    MAIL_USERNAME = os.getenv("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")
    MAIL_DEFAULT_SENDER = os.getenv("MAIL_DEFAULT_SENDER", "")

    # --- Frontend (used to build links in emails) ---
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # Required in every non-test environment; checked at startup.
    REQUIRED_SETTINGS: tuple[str, ...] = (
        "SECRET_KEY",
        "JWT_SECRET_KEY",
        "SQLALCHEMY_DATABASE_URI",
    )


class DevelopmentConfig(BaseConfig):
    DEBUG = True


class ProductionConfig(BaseConfig):
    DEBUG = False
    JWT_COOKIE_SECURE = True


class TestingConfig(BaseConfig):
    TESTING = True
    SECRET_KEY = "test-secret-key"
    JWT_SECRET_KEY = "test-jwt-secret-key-that-is-long-enough"
    SQLALCHEMY_DATABASE_URI = os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")
    SQLALCHEMY_ENGINE_OPTIONS: dict = {}
    RATELIMIT_ENABLED = False
    AWS_REGION = "us-east-1"
    S3_BUCKET_NAME = "test-bucket"
    FRONTEND_URL = "http://localhost:3000"


CONFIGS: dict[str, type[BaseConfig]] = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}
