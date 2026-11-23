"""Application factory."""

import logging
import os
from typing import Any

from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

from app.config import CONFIGS, BaseConfig
from app.extensions import db, jwt, limiter, migrate
from app.routes.auth_routes import auth_bp
from app.routes.file_routes import files_bp
from app.routes.health_routes import health_bp
from app.services.email_service import init_email
from app.utils.errors import register_error_handlers


def create_app(
    config_name: str | None = None, config_overrides: dict[str, Any] | None = None
) -> Flask:
    """Build and configure a Flask app.

    `config_name` is one of "development", "production", "testing".
    Defaults to the FLASK_ENV environment variable, then "development".
    `config_overrides` lets tests tweak individual settings.
    """
    config_name = config_name or os.getenv("FLASK_ENV", "development")
    config_class = CONFIGS[config_name]

    app = Flask(__name__)
    app.config.from_object(config_class)
    app.config.update(config_overrides or {})
    _check_required_settings(app, config_class)
    _configure_logging(app)
    _trust_reverse_proxy(app)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    limiter.init_app(app)
    init_email(app)

    register_error_handlers(app)
    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(files_bp)

    # Import models so Flask-Migrate can see them when generating migrations.
    from app import models  # noqa: F401

    return app


def _check_required_settings(app: Flask, config_class: type[BaseConfig]) -> None:
    if app.config["TESTING"]:
        return
    missing = [name for name in config_class.REQUIRED_SETTINGS if not app.config.get(name)]
    if missing:
        raise RuntimeError(f"Missing required settings: {', '.join(missing)}")


def _trust_reverse_proxy(app: Flask) -> None:
    """Behind the Next.js proxy, use X-Forwarded-For as the client IP (for rate limits)."""
    count = app.config["TRUSTED_PROXY_COUNT"]
    if count > 0:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=count)  # type: ignore[method-assign]


def _configure_logging(app: Flask) -> None:
    level = logging.DEBUG if app.debug else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
