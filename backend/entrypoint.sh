#!/bin/sh
# Apply database migrations, then hand off to gunicorn.
# One worker with threads keeps the in-memory rate-limit counters in a single process.
set -e
flask --app wsgi db upgrade
exec gunicorn --bind 0.0.0.0:5000 \
    --workers "${GUNICORN_WORKERS:-1}" --threads "${GUNICORN_THREADS:-4}" \
    --access-logfile - wsgi:app
