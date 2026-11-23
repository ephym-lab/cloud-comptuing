# Project: S3 File Share — AWS S3 Demo App

You are building a small but production-structured web app whose purpose is to **demonstrate how Amazon S3 works** in a live class/team demo. Users register, verify their email, sign in, and then upload, preview, download, version and delete files (video, audio, images, documents) stored in a **private** S3 bucket, accessed only through **presigned URLs**.

Code quality and clean architecture matter as much as features — this codebase will be shown and explained to an audience.

**How to work:**
1. First, read this whole document and reply with a short implementation plan and any questions. Do not write code until I confirm.
2. Then build **phase by phase** (see "Build phases" at the end). At the end of each phase, run the tests/linters, summarize what was done, and wait for me before moving on.
3. Never hard-code secrets. Never ask me to paste secrets into the chat — I will put them in `.env` files myself. Make sure every `.env` is git-ignored and provide `.env.example` files instead.

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Backend | Python 3.12, Flask (app factory + blueprints), SQLAlchemy 2.x, Flask-Migrate (Alembic), boto3, marshmallow (or pydantic) for request/response schemas, flask-jwt-extended, Flask-Limiter, gunicorn |
| Database | PostgreSQL 16 (Docker image `postgres:16-alpine`) |
| Email | Gmail SMTP (`smtp.gmail.com`, port 587, STARTTLS) using a Gmail **App Password** |
| Frontend | Next.js (latest stable, App Router), TypeScript, Tailwind CSS |
| Storage | Amazon S3 (private bucket, versioning on) |
| Local orchestration | Docker Compose (db, backend, frontend) |
| Tests | pytest + `moto` (mock S3) for backend; basic type-check/lint for frontend |

---

## 2. Repository structure

```
s3-file-share/
├── docker-compose.yml
├── .env.example                  # shared/compose-level vars
├── .gitignore
├── README.md                     # setup, run, demo script
├── docs/
│   └── aws-setup.md              # bucket, versioning, CORS JSON, IAM policy JSON, cleanup
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example
│   ├── wsgi.py
│   ├── migrations/
│   ├── app/
│   │   ├── __init__.py           # create_app(config_name)
│   │   ├── config.py             # Dev / Test / Prod config classes, read from env
│   │   ├── extensions.py         # db, migrate, jwt, limiter instances
│   │   ├── models/               # SQLAlchemy models (User, File, AuthToken)
│   │   ├── repositories/         # DB access ONLY (no business logic)
│   │   ├── services/             # business logic
│   │   │   ├── auth_service.py
│   │   │   ├── email_service.py
│   │   │   ├── storage_service.py   # the ONLY module that imports boto3
│   │   │   └── file_service.py
│   │   ├── routes/               # Flask blueprints — thin controllers
│   │   │   ├── auth_routes.py
│   │   │   ├── file_routes.py
│   │   │   └── health_routes.py
│   │   ├── schemas/              # request validation + response serialization
│   │   ├── utils/
│   │   │   ├── errors.py         # custom exceptions + JSON error handlers
│   │   │   ├── file_types.py     # allowlist, MIME → category mapping
│   │   │   └── security.py       # token generation/hashing helpers
│   │   └── templates/email/      # verify_email.html, reset_password.html (+ .txt)
│   └── tests/
│       ├── conftest.py
│       ├── test_auth.py
│       └── test_files.py
└── frontend/
    ├── Dockerfile
    ├── .env.example
    ├── next.config.ts            # rewrite /api/* → backend
    ├── middleware.ts             # redirect unauthenticated users to /login
    └── src/
        ├── app/
        │   ├── (auth)/login/page.tsx
        │   ├── (auth)/register/page.tsx
        │   ├── (auth)/verify-email/page.tsx
        │   ├── (auth)/forgot-password/page.tsx
        │   ├── (auth)/reset-password/page.tsx
        │   └── (app)/dashboard/page.tsx
        ├── components/           # UploadZone, FileList, FileCard, FilterTabs,
        │                         # PreviewModal, VersionHistory, ExpiryCountdown, Navbar
        ├── lib/
        │   ├── api.ts            # typed fetch wrapper (credentials, CSRF header, errors, auto-refresh)
        │   └── upload.ts         # presigned POST upload with progress (XMLHttpRequest)
        └── types/
```

### Layering rules (enforce strictly)
- **Routes**: parse + validate input with schemas → call a service → serialize output. No DB queries, no boto3, no business logic.
- **Services**: all business rules (ownership checks, file-type rules, token expiry, etc.). Call repositories and `storage_service`.
- **Repositories**: SQLAlchemy queries only. One per aggregate (`UserRepository`, `FileRepository`, `AuthTokenRepository`).
- **storage_service**: the only place boto3 is used. Wraps: presigned POST, presigned GET (inline/attachment), head_object, list_object_versions, delete_object, copy_object (restore version).
- **Errors**: raise custom exceptions (`ValidationError`, `NotFoundError`, `ForbiddenError`, `ConflictError`, `UnauthorizedError`) and convert them to a consistent JSON shape in one place: `{"error": {"code": "...", "message": "...", "details": {...}}}`.
- Use type hints throughout and keep functions small.

---

## 3. Data model

**User**: `id (UUID)`, `name`, `email (unique, lowercased)`, `password_hash` (werkzeug/argon2/bcrypt), `is_verified (bool)`, `created_at`, `updated_at`.

**AuthToken** (for email verification + password reset): `id`, `user_id (FK)`, `token_hash` (store only a SHA-256 hash, never the raw token), `purpose` (`verify_email` | `reset_password`), `expires_at`, `used_at (nullable)`, `created_at`.
- Verification tokens expire in 24h, reset tokens in 30 min. Single use.

**File** (metadata; S3 holds the bytes): `id (UUID)`, `user_id (FK)`, `s3_key (unique)`, `original_name`, `category` (`video|audio|image|document|other`), `content_type`, `size_bytes`, `created_at`, `updated_at`.
- Unique on `s3_key`. Re-uploading the same filename to the same category overwrites the same key → S3 creates a new **version**; update the existing DB row instead of inserting a duplicate.

---

## 4. Auth

- **Register** `POST /api/auth/register` `{name, email, password}` → creates unverified user, sends verification email. Password rules: min 8 chars, at least one letter and one number.
- **Verify** `POST /api/auth/verify-email` `{token}`.
- **Resend verification** `POST /api/auth/resend-verification` `{email}` (always returns a generic success message).
- **Login** `POST /api/auth/login` `{email, password}` → only verified users may log in. Sets JWTs in **httpOnly cookies** (flask-jwt-extended cookie mode, `SameSite=Lax`, `Secure` in prod) with CSRF double-submit protection enabled.
  - Access token: 15 min. Refresh token: 7 days.
- **Refresh** `POST /api/auth/refresh`. **Logout** `POST /api/auth/logout` (clears cookies). **Me** `GET /api/auth/me`.
- **Forgot password** `POST /api/auth/forgot-password` `{email}` → always generic response (don't reveal whether the email exists); sends reset link if it does.
- **Reset password** `POST /api/auth/reset-password` `{token, new_password}`.
- Rate-limit login, register, forgot-password and resend-verification (e.g. 5/min per IP) with Flask-Limiter.
- Email links point to the frontend: `${FRONTEND_URL}/verify-email?token=...` and `${FRONTEND_URL}/reset-password?token=...`.

### Email service
- Send via Gmail SMTP using `MAIL_USERNAME` (Gmail address) and `MAIL_PASSWORD` (16-char App Password), STARTTLS on 587.
- Send both HTML and plain-text bodies from templates. Keep templates simple and branded "S3 File Share".
- Make email sending swappable/mocked in tests (no real emails during tests). If SMTP fails, log the error; in development also log the link to the console so the demo isn't blocked.

---

## 5. Files & S3

### Key layout (shows that "folders" are just prefixes)
```
users/{user_id}/videos/{safe_filename}
users/{user_id}/audio/{safe_filename}
users/{user_id}/images/{safe_filename}
users/{user_id}/documents/{safe_filename}
users/{user_id}/other/{safe_filename}
```
Category is decided by the backend from the MIME type and extension (never trust the client alone). Sanitize filenames with `secure_filename`.

### Allowlist & limits (configurable via env)
- Video: mp4, webm, mov · Audio: mp3, wav, ogg, m4a · Image: jpg, jpeg, png, gif, webp · Document: pdf, txt, docx, xlsx, pptx, csv · Other: zip
- Max size: `MAX_UPLOAD_MB` (default 100).

### Upload flow (direct browser → S3)
1. `POST /api/files/upload-url` `{filename, content_type, size}` → backend validates type/size, builds key, returns a **presigned POST** (`url` + `fields`) with conditions: exact key, `Content-Type`, and `content-length-range` [1, MAX]. Expires in 5 min.
2. Frontend uploads directly to S3 with `XMLHttpRequest` (multipart form) to show a **progress bar**.
3. `POST /api/files/confirm` `{key}` → backend calls `head_object` to verify the object exists and belongs to the user's prefix, then creates/updates the File row.

### File endpoints (all require auth; every handler checks ownership)
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/files/upload-url` | Presigned POST for direct upload |
| POST | `/api/files/confirm` | Confirm upload, save metadata |
| GET | `/api/files?category=video` | List current user's files (optional category filter) |
| GET | `/api/files/stats` | Count + total size per category |
| GET | `/api/files/{id}/preview` | Presigned GET, `ResponseContentDisposition=inline`, expiry `PRESIGNED_URL_EXPIRY_SECONDS` (default 60) → `{url, expires_in, expires_at}` |
| GET | `/api/files/{id}/download` | Presigned GET with `attachment; filename="..."` |
| GET | `/api/files/{id}/share?minutes=10` | Longer-lived share link (max 60 min) |
| GET | `/api/files/{id}/direct-url` | Returns the raw, unsigned S3 URL (used to show "Access Denied" in the demo) |
| GET | `/api/files/{id}/versions` | `list_object_versions` for that exact key → versionId, isLatest, size, lastModified |
| POST | `/api/files/{id}/versions/{version_id}/restore` | Restore an old version via `copy_object` with `CopySource.VersionId` |
| DELETE | `/api/files/{id}` | Delete object (creates a delete marker since versioning is on) and remove DB row |
| GET | `/api/health` | Health check (DB connectivity) |

---

## 6. Frontend

Single main page (`/dashboard`) plus auth pages. Clean, modern UI with Tailwind; responsive; loading/empty/error states everywhere.

- **Navbar**: app name, user name, logout.
- **Upload zone**: drag-and-drop + file picker, client-side type/size check, per-file progress bars, shows which category/prefix it will land in.
- **Filter tabs**: All / Videos / Audio / Images / Documents / Other, with counts from `/stats`.
- **File list/grid**: icon by category, name, size (human-readable), date, S3 key (small, monospace — useful for the demo). Actions: Preview, Download, Share, Versions, Delete (with confirm dialog).
- **Preview modal**: `<video controls>`, `<audio controls>`, `<img>`, or open PDF in a new tab; others → "No preview, download instead". Shows an **ExpiryCountdown** ("link expires in 60s") and, once expired, a note explaining the link is now invalid.
- **"Try direct link" button**: opens the raw S3 URL in a new tab so the audience sees *Access Denied*.
- **Version history panel**: list of versions with dates/sizes, "Latest" badge, "Restore" button.
- **Storage summary**: total files and total size per category.
- **Auth pages**: register, login, verify-email (reads token from URL, calls API), forgot-password, reset-password. Show inline validation errors from the API.
- `lib/api.ts`: always sends `credentials: "include"`, attaches the CSRF header from the `csrf_access_token` cookie on mutating requests, on 401 tries `/api/auth/refresh` once then redirects to `/login`.
- `next.config.ts` rewrites `/api/:path*` → `${BACKEND_URL}/api/:path*` so the browser stays same-origin with the backend (cookies + no CORS issues).
- `middleware.ts` protects `/dashboard`.

---

## 7. Docker & configuration

`docker-compose.yml` services:
- **db**: `postgres:16-alpine`, named volume, healthcheck (`pg_isready`).
- **backend**: built from `backend/Dockerfile` (python:3.12-slim, gunicorn), depends on healthy db, runs `flask db upgrade` on start, exposes 5000, has a healthcheck on `/api/health`.
- **frontend**: built from `frontend/Dockerfile` (node LTS alpine, multi-stage build), `BACKEND_URL=http://backend:5000`, exposes 3000.

`docker compose up --build` must bring up the whole app. Also document how to run backend and frontend locally without Docker (with only `db` in Docker).

### Environment variables (`backend/.env.example`)
```
FLASK_ENV=development
SECRET_KEY=change-me
JWT_SECRET_KEY=change-me
DATABASE_URL=postgresql+psycopg://s3demo:s3demo@db:5432/s3demo

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET_NAME=

PRESIGNED_URL_EXPIRY_SECONDS=60
MAX_UPLOAD_MB=100

MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_DEFAULT_SENDER=

FRONTEND_URL=http://localhost:3000
```

---

## 8. AWS setup doc (`docs/aws-setup.md`)

Write step-by-step console instructions plus ready-to-paste JSON for:
1. Creating the bucket with **Block Public Access ON** and **Versioning enabled**.
2. **Bucket CORS** allowing `POST`, `GET`, `HEAD` from `http://localhost:3000`, exposing `ETag`.
3. **IAM user policy** (least privilege, this bucket only): `s3:ListBucket`, `s3:ListBucketVersions` on the bucket ARN; `s3:GetObject`, `s3:GetObjectVersion`, `s3:PutObject`, `s3:DeleteObject` on `bucket/*`.
4. Optional lifecycle rule (transition to Glacier after 30 days) as a talking point.
5. Cleanup steps after the demo (empty bucket incl. all versions, delete bucket, deactivate/delete access keys).

---

## 9. Testing & quality

- pytest with an app factory test config, `moto` for S3, mocked email service.
- Cover: register → verify → login flow, unverified login rejected, forgot/reset password, token expiry/single-use, upload-url validation (bad type, too big), confirm upload, ownership (user A cannot access user B's file), list/filter, versions, delete.
- Backend: `ruff` for lint/format. Frontend: `tsc --noEmit` and `next lint`.

---

## 10. README

Include: project overview, architecture diagram (ASCII), prerequisites, AWS + Gmail App Password setup links to the docs, how to run (Docker and local), how to run tests, and a **10-minute demo script**:
1. Register → show verification email arriving → log in.
2. Show empty bucket in AWS console.
3. Upload a video with the progress bar → refresh console → show `users/<id>/videos/` prefix.
4. Play the video in the app and scrub (byte-range streaming).
5. "Try direct link" → Access Denied (private bucket).
6. Preview link countdown → expires → link no longer works.
7. Re-upload same file → version history → restore old version.
8. Wrap-up: storage classes, lifecycle, cost, real-world uses.

---

## Build phases

1. **Scaffold**: repo structure, Docker Compose, configs, app factory, extensions, error handling, health route, Next.js app with Tailwind and API proxy. ✅ `docker compose up` shows a working health check and a placeholder page.
2. **Auth backend**: models, migrations, repositories, auth + email services, routes, rate limiting, tests.
3. **Auth frontend**: auth pages, api client, middleware, navbar.
4. **Files backend**: storage service, file service/repository, all file routes, tests with moto.
5. **Files frontend**: upload with progress, list, filters, preview modal, countdown, direct-link button, download, share, delete.
6. **Versions & extras**: version history + restore, stats, drag-and-drop polish.
7. **Docs & polish**: `docs/aws-setup.md`, README with demo script, final lint/test pass.