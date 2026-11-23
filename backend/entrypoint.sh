#!/bin/sh
# Apply database migrations, then hand off to gunicorn.
set -e
flask --app wsgi db upgrade
exec gunicorn --bind 0.0.0.0:5000 --workers "${GUNICORN_WORKERS:-2}" --access-logfile - wsgi:app
