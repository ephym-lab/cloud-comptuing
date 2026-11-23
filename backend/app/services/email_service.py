"""Transactional email.

`EmailService` builds messages from templates; an `EmailSender` delivers them.
The sender is chosen once at startup and stored on the app, which makes it easy
to swap:
  - SmtpEmailSender    → real Gmail SMTP (STARTTLS on 587, App Password)
  - ConsoleEmailSender → logs the email (development without SMTP credentials)
  - MemoryEmailSender  → keeps emails in a list (tests; nothing is sent)
"""

import logging
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage
from typing import Any, Protocol

from flask import Flask, current_app, render_template

from app.models import User

logger = logging.getLogger(__name__)

APP_NAME = "S3 File Share"
EXTENSION_KEY = "email_sender"


@dataclass(frozen=True)
class OutgoingEmail:
    to: str
    subject: str
    text_body: str
    html_body: str


class EmailSender(Protocol):
    def send(self, email: OutgoingEmail) -> None: ...


@dataclass
class SmtpEmailSender:
    server: str
    port: int
    use_tls: bool
    username: str
    password: str
    default_sender: str
    timeout_seconds: int = 30

    def send(self, email: OutgoingEmail) -> None:
        message = EmailMessage()
        message["Subject"] = email.subject
        message["From"] = f"{APP_NAME} <{self.default_sender}>"
        message["To"] = email.to
        message.set_content(email.text_body)
        message.add_alternative(email.html_body, subtype="html")

        with smtplib.SMTP(self.server, self.port, timeout=self.timeout_seconds) as smtp:
            if self.use_tls:
                smtp.starttls()
            smtp.login(self.username, self.password)
            smtp.send_message(message)


class ConsoleEmailSender:
    def send(self, email: OutgoingEmail) -> None:
        logger.info(
            "[console email] To: %s | Subject: %s\n%s", email.to, email.subject, email.text_body
        )


@dataclass
class MemoryEmailSender:
    outbox: list[OutgoingEmail] = field(default_factory=list)

    def send(self, email: OutgoingEmail) -> None:
        self.outbox.append(email)


def build_email_sender(config: dict[str, Any]) -> EmailSender:
    if config.get("TESTING"):
        return MemoryEmailSender()
    if not (config.get("MAIL_USERNAME") and config.get("MAIL_PASSWORD")):
        logger.warning("MAIL_USERNAME/MAIL_PASSWORD not set: emails will be logged, not sent.")
        return ConsoleEmailSender()
    return SmtpEmailSender(
        server=config["MAIL_SERVER"],
        port=config["MAIL_PORT"],
        use_tls=config["MAIL_USE_TLS"],
        username=config["MAIL_USERNAME"],
        password=config["MAIL_PASSWORD"],
        default_sender=config.get("MAIL_DEFAULT_SENDER") or config["MAIL_USERNAME"],
    )


def init_email(app: Flask) -> None:
    app.extensions[EXTENSION_KEY] = build_email_sender(app.config)


class EmailService:
    def __init__(self, sender: EmailSender | None = None) -> None:
        self._sender = sender or current_app.extensions[EXTENSION_KEY]

    def send_verification_email(self, user: User, raw_token: str) -> None:
        link = self._frontend_link("verify-email", raw_token)
        self._send(user, "Verify your email", "verify_email", link, expires_in="24 hours")

    def send_password_reset_email(self, user: User, raw_token: str) -> None:
        link = self._frontend_link("reset-password", raw_token)
        self._send(user, "Reset your password", "reset_password", link, expires_in="30 minutes")

    @staticmethod
    def _frontend_link(path: str, raw_token: str) -> str:
        base_url = current_app.config["FRONTEND_URL"].rstrip("/")
        return f"{base_url}/{path}?token={raw_token}"

    def _send(self, user: User, subject: str, template: str, link: str, **context: str) -> None:
        context = {"app_name": APP_NAME, "name": user.name, "link": link, **context}
        email = OutgoingEmail(
            to=user.email,
            subject=f"{APP_NAME} – {subject}",
            text_body=render_template(f"email/{template}.txt", **context),
            html_body=render_template(f"email/{template}.html", **context),
        )
        try:
            self._sender.send(email)
        except Exception:
            # Email failure must never break the request (the user can resend).
            logger.exception("Failed to send '%s' email to %s", template, user.email)
            if current_app.debug:
                logger.warning("Development fallback – use this link instead: %s", link)
