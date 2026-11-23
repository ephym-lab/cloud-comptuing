"""WSGI entry point for gunicorn (`gunicorn wsgi:app`) and the Flask CLI."""

from app import create_app

app = create_app()
