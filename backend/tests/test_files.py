"""File endpoint tests against a fake S3 (moto).

Uploads go through the real browser path: the presigned POST form is sent over
HTTP with `requests`, which moto intercepts. Note that moto does not enforce POST
policy conditions (size/type) — real S3 does — so those are checked by decoding
the signed policy instead.
"""

import base64
import json
from urllib.parse import parse_qs, urlparse

import pytest
import requests
from sqlalchemy import func, select

from app.extensions import db
from app.models import File, User
from tests.conftest import TEST_BUCKET, csrf_header

MB = 1024 * 1024


# --- Helpers ---


def request_upload(client, filename="clip.mp4", content_type="video/mp4", size=10):
    return client.post(
        "/api/files/upload-url",
        json={"filename": filename, "content_type": content_type, "size": size},
        headers=csrf_header(client),
    )


def post_to_s3(ticket: dict, body: bytes) -> None:
    """What the browser does: multipart POST of the signed fields + the file."""
    response = requests.post(
        ticket["url"], data=ticket["fields"], files={"file": ("upload", body)}, timeout=5
    )
    assert response.status_code == 204, response.text


def confirm(client, key: str):
    return client.post("/api/files/confirm", json={"key": key}, headers=csrf_header(client))


def upload(client, filename="clip.mp4", content_type="video/mp4", body=b"version-1") -> dict:
    """Full flow: presign → upload to S3 → confirm. Returns the confirm response body."""
    ticket_response = request_upload(client, filename, content_type, len(body))
    assert ticket_response.status_code == 200, ticket_response.get_json()
    post_to_s3(ticket_response.get_json(), body)
    response = confirm(client, ticket_response.get_json()["key"])
    assert response.status_code in (200, 201), response.get_json()
    return response.get_json()


def user_id(email: str = "ada@example.com") -> str:
    return str(db.session.scalar(select(User.id).where(User.email == email)))


def query_params(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}


def error_code(response) -> str:
    return response.get_json()["error"]["code"]


# --- Auth & CSRF ---


def test_file_endpoints_require_login(client, s3):
    assert client.get("/api/files").status_code == 401
    assert client.post("/api/files/upload-url", json={}).status_code == 401


def test_mutating_requests_require_csrf_header(auth_client, s3):
    response = auth_client.post(
        "/api/files/upload-url",
        json={"filename": "clip.mp4", "content_type": "video/mp4", "size": 10},
    )
    assert response.status_code == 401


# --- Upload URL validation ---


def test_upload_url_returns_presigned_post_for_user_prefix(auth_client, s3):
    response = request_upload(auth_client, "clip.mp4", "video/mp4", 10)

    assert response.status_code == 200
    ticket = response.get_json()
    assert ticket["key"] == f"users/{user_id()}/videos/clip.mp4"
    assert ticket["category"] == "video"
    assert ticket["expires_in"] == 300
    assert ticket["max_bytes"] == 100 * MB
    assert ticket["fields"]["key"] == ticket["key"]
    assert ticket["fields"]["Content-Type"] == "video/mp4"
    assert {"policy", "x-amz-signature", "x-amz-credential"} <= set(ticket["fields"])


def test_presigned_post_policy_pins_key_type_and_size(auth_client, s3):
    ticket = request_upload(auth_client).get_json()

    policy = json.loads(base64.b64decode(ticket["fields"]["policy"]))
    conditions = policy["conditions"]
    assert {"key": ticket["key"]} in conditions
    assert {"Content-Type": "video/mp4"} in conditions
    assert ["content-length-range", 1, 100 * MB] in conditions


@pytest.mark.parametrize(
    ("filename", "folder", "category"),
    [
        ("song.mp3", "audio", "audio"),
        ("photo.JPG", "images", "image"),
        ("report.pdf", "documents", "document"),
        ("data.csv", "documents", "document"),
        ("bundle.zip", "other", "other"),
    ],
)
def test_category_and_prefix_come_from_extension(auth_client, s3, filename, folder, category):
    ticket = request_upload(auth_client, filename, "", 10).get_json()

    assert ticket["category"] == category
    assert ticket["key"] == f"users/{user_id()}/{folder}/{filename}"


def test_generic_browser_mime_type_gets_canonical_content_type(auth_client, s3):
    ticket = request_upload(auth_client, "notes.docx", "application/octet-stream").get_json()

    assert ticket["content_type"].endswith("wordprocessingml.document")
    assert ticket["fields"]["Content-Type"] == ticket["content_type"]


def test_rejects_disallowed_extension(auth_client, s3):
    response = request_upload(auth_client, "virus.exe", "application/x-msdownload")

    assert response.status_code == 422
    assert error_code(response) == "unsupported_file_type"
    assert "mp4" in response.get_json()["error"]["details"]["allowed_extensions"]


def test_rejects_mime_type_that_contradicts_extension(auth_client, s3):
    response = request_upload(auth_client, "clip.mp4", "image/png")

    assert response.status_code == 422
    assert error_code(response) == "unsupported_file_type"


def test_rejects_file_over_size_limit(auth_client, s3):
    response = request_upload(auth_client, size=100 * MB + 1)

    assert response.status_code == 422
    assert error_code(response) == "file_too_large"


def test_rejects_empty_file(auth_client, s3):
    response = request_upload(auth_client, size=0)

    assert response.status_code == 422
    assert error_code(response) == "empty_file"


def test_allowed_extensions_setting_narrows_allowlist(app, auth_client, s3):
    app.config["ALLOWED_EXTENSIONS"] = ("png",)

    assert request_upload(auth_client, "clip.mp4").status_code == 422
    assert request_upload(auth_client, "pic.png", "image/png").status_code == 200


def test_upload_url_validates_body(auth_client, s3):
    response = auth_client.post("/api/files/upload-url", json={}, headers=csrf_header(auth_client))

    assert response.status_code == 422
    fields = response.get_json()["error"]["details"]["fields"]
    assert set(fields) == {"filename", "content_type", "size"}


def test_filename_is_sanitized_but_original_name_kept(auth_client, s3):
    body = upload(auth_client, "My Clip (final).mp4")

    assert body["file"]["s3_key"].endswith("/videos/My_Clip_final.mp4")
    assert body["file"]["original_name"] == "My Clip (final).mp4"


def test_non_ascii_filename_gets_stable_fallback_key(auth_client, s3):
    first = request_upload(auth_client, "видео.mp4").get_json()["key"]
    second = request_upload(auth_client, "видео.mp4").get_json()["key"]

    assert first == second
    assert first.rsplit("/", 1)[1].startswith("file-") and first.endswith(".mp4")


# --- Confirm ---


def test_confirm_creates_file_from_s3_metadata(auth_client, s3):
    body = upload(auth_client, "clip.mp4", body=b"x" * 1234)

    assert body["is_new_version"] is False
    file = body["file"]
    assert file["size_bytes"] == 1234
    assert file["content_type"] == "video/mp4"
    assert file["category"] == "video"
    assert file["original_name"] == "clip.mp4"


def test_confirm_returns_201_for_new_file(auth_client, s3):
    ticket = request_upload(auth_client).get_json()
    post_to_s3(ticket, b"data")

    assert confirm(auth_client, ticket["key"]).status_code == 201


def test_confirm_fails_when_object_missing_in_s3(auth_client, s3):
    ticket = request_upload(auth_client).get_json()  # never uploaded

    response = confirm(auth_client, ticket["key"])

    assert response.status_code == 404
    assert error_code(response) == "upload_not_found"


def test_cannot_confirm_key_in_another_users_prefix(auth_client, other_client, s3):
    ticket = request_upload(auth_client).get_json()
    post_to_s3(ticket, b"data")

    response = confirm(other_client, ticket["key"])

    assert response.status_code == 403


@pytest.mark.parametrize(
    "bad_key",
    [
        "clip.mp4",
        "users/{uid}/images/clip.mp4",  # wrong folder for the extension
        "users/{uid}/videos/../clip.mp4",
        "users/{uid}/videos/clip.exe",
    ],
)
def test_confirm_rejects_malformed_keys(auth_client, s3, bad_key):
    response = confirm(auth_client, bad_key.format(uid=user_id()))

    assert response.status_code == 422
    assert error_code(response) == "invalid_key"


def test_reupload_same_name_creates_new_version_not_new_row(auth_client, s3):
    first = upload(auth_client, body=b"v1")
    second = upload(auth_client, body=b"version-two")

    assert second["is_new_version"] is True
    assert second["file"]["id"] == first["file"]["id"]
    assert second["file"]["size_bytes"] == len(b"version-two")
    assert db.session.scalar(select(func.count(File.id))) == 1


# --- Listing & stats ---


def test_list_and_filter_by_category(auth_client, s3):
    upload(auth_client, "clip.mp4")
    upload(auth_client, "song.mp3", "audio/mpeg")
    upload(auth_client, "photo.png", "image/png")

    all_files = auth_client.get("/api/files").get_json()["files"]
    videos = auth_client.get("/api/files?category=video").get_json()["files"]

    assert len(all_files) == 3
    assert [f["original_name"] for f in videos] == ["clip.mp4"]


def test_list_rejects_unknown_category(auth_client, s3):
    response = auth_client.get("/api/files?category=spreadsheets")

    assert response.status_code == 422


def test_stats_counts_and_sizes_per_category(auth_client, s3):
    upload(auth_client, "a.mp4", body=b"x" * 100)
    upload(auth_client, "b.mp4", body=b"x" * 50)
    upload(auth_client, "c.png", "image/png", body=b"x" * 10)

    stats = auth_client.get("/api/files/stats").get_json()

    assert stats["categories"]["video"] == {"count": 2, "total_bytes": 150}
    assert stats["categories"]["image"] == {"count": 1, "total_bytes": 10}
    assert stats["categories"]["audio"] == {"count": 0, "total_bytes": 0}
    assert stats["total"] == {"count": 3, "total_bytes": 160}


def test_upload_config_lists_allowlist(auth_client, s3):
    config = auth_client.get("/api/files/upload-config").get_json()

    assert config["max_upload_mb"] == 100
    assert config["categories"]["video"] == {
        "folder": "videos",
        "extensions": ["mov", "mp4", "webm"],
    }


# --- Ownership ---


def test_users_cannot_see_or_touch_each_others_files(auth_client, other_client, s3):
    file_id = upload(auth_client)["file"]["id"]
    headers = csrf_header(other_client)

    assert other_client.get("/api/files").get_json()["files"] == []
    for path in ("preview", "download", "share", "direct-url", "versions"):
        assert other_client.get(f"/api/files/{file_id}/{path}").status_code == 404, path
    restore = other_client.post(f"/api/files/{file_id}/versions/abc/restore", headers=headers)
    assert restore.status_code == 404
    assert other_client.delete(f"/api/files/{file_id}", headers=headers).status_code == 404
    # ...and the owner still has it.
    assert auth_client.get(f"/api/files/{file_id}/preview").status_code == 200


def test_unknown_file_id_is_404(auth_client, s3):
    response = auth_client.get("/api/files/00000000-0000-0000-0000-000000000000/preview")

    assert response.status_code == 404


# --- Signed links ---


def test_preview_url_is_short_lived_and_inline(auth_client, s3):
    file_id = upload(auth_client)["file"]["id"]

    body = auth_client.get(f"/api/files/{file_id}/preview").get_json()

    params = query_params(body["url"])
    assert body["expires_in"] == 60
    assert "expires_at" in body
    assert params["X-Amz-Expires"] == "60"
    assert params["response-content-disposition"].startswith("inline;")
    assert params["response-content-type"] == "video/mp4"


def test_preview_url_actually_serves_the_file(auth_client, s3):
    file_id = upload(auth_client, body=b"hello video")["file"]["id"]
    url = auth_client.get(f"/api/files/{file_id}/preview").get_json()["url"]

    assert requests.get(url, timeout=5).content == b"hello video"


def test_download_url_is_attachment_with_original_name(auth_client, s3):
    file_id = upload(auth_client, "My Clip.mp4")["file"]["id"]

    url = auth_client.get(f"/api/files/{file_id}/download").get_json()["url"]

    disposition = query_params(url)["response-content-disposition"]
    assert disposition.startswith('attachment; filename="My Clip.mp4"')


def test_share_url_uses_requested_minutes(auth_client, s3):
    file_id = upload(auth_client)["file"]["id"]

    body = auth_client.get(f"/api/files/{file_id}/share?minutes=10").get_json()

    assert body["expires_in"] == 600
    assert query_params(body["url"])["X-Amz-Expires"] == "600"


@pytest.mark.parametrize("minutes", [0, 61])
def test_share_url_rejects_out_of_range_minutes(auth_client, s3, minutes):
    file_id = upload(auth_client)["file"]["id"]

    response = auth_client.get(f"/api/files/{file_id}/share?minutes={minutes}")

    assert response.status_code == 422


def test_direct_url_is_unsigned(auth_client, s3):
    body = upload(auth_client)
    file_id, key = body["file"]["id"], body["file"]["s3_key"]

    url = auth_client.get(f"/api/files/{file_id}/direct-url").get_json()["url"]

    assert url == f"https://{TEST_BUCKET}.s3.us-east-1.amazonaws.com/{key}"
    assert "X-Amz-Signature" not in url


# --- Versions ---


def test_versions_lists_every_upload_latest_first(auth_client, s3):
    upload(auth_client, body=b"v1")
    file_id = upload(auth_client, body=b"version-2")["file"]["id"]

    versions = auth_client.get(f"/api/files/{file_id}/versions").get_json()["versions"]

    assert len(versions) == 2
    assert versions[0]["is_latest"] is True
    assert versions[0]["size"] == len(b"version-2")
    assert versions[1]["is_latest"] is False


def test_versions_ignore_keys_that_share_the_prefix(auth_client, s3):
    file_id = upload(auth_client, "clip.mp4")["file"]["id"]
    s3.put_object(Bucket=TEST_BUCKET, Key=f"users/{user_id()}/videos/clip.mp4.bak", Body=b"x")

    versions = auth_client.get(f"/api/files/{file_id}/versions").get_json()["versions"]

    assert len(versions) == 1


def test_restore_old_version_makes_it_current(auth_client, s3):
    upload(auth_client, body=b"v1")
    file_id = upload(auth_client, body=b"version-2")["file"]["id"]
    versions = auth_client.get(f"/api/files/{file_id}/versions").get_json()["versions"]
    old_version_id = versions[1]["version_id"]

    response = auth_client.post(
        f"/api/files/{file_id}/versions/{old_version_id}/restore",
        headers=csrf_header(auth_client),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["restored_version_id"] == old_version_id
    assert body["file"]["size_bytes"] == len(b"v1")
    after = auth_client.get(f"/api/files/{file_id}/versions").get_json()["versions"]
    assert len(after) == 3  # history is kept; the restore is a new version
    assert after[0]["version_id"] == body["new_version_id"]
    current = s3.get_object(Bucket=TEST_BUCKET, Key=body["file"]["s3_key"])["Body"].read()
    assert current == b"v1"


def test_restore_latest_version_is_conflict(auth_client, s3):
    file_id = upload(auth_client)["file"]["id"]
    latest = auth_client.get(f"/api/files/{file_id}/versions").get_json()["versions"][0]

    response = auth_client.post(
        f"/api/files/{file_id}/versions/{latest['version_id']}/restore",
        headers=csrf_header(auth_client),
    )

    assert response.status_code == 409


def test_restore_unknown_version_is_404(auth_client, s3):
    file_id = upload(auth_client)["file"]["id"]

    response = auth_client.post(
        f"/api/files/{file_id}/versions/not-a-version/restore", headers=csrf_header(auth_client)
    )

    assert response.status_code == 404


# --- Delete ---


def test_delete_removes_row_and_adds_delete_marker(auth_client, s3):
    body = upload(auth_client)
    file_id, key = body["file"]["id"], body["file"]["s3_key"]

    response = auth_client.delete(f"/api/files/{file_id}", headers=csrf_header(auth_client))

    assert response.status_code == 204
    assert auth_client.get("/api/files").get_json()["files"] == []
    listing = s3.list_object_versions(Bucket=TEST_BUCKET, Prefix=key)
    assert len(listing["DeleteMarkers"]) == 1
    assert len(listing["Versions"]) == 1  # the bytes are still recoverable


# --- S3 failures ---


def test_s3_errors_become_storage_error(app, auth_client, s3):
    file_id = upload(auth_client)["file"]["id"]
    app.config["S3_BUCKET_NAME"] = "bucket-that-does-not-exist"

    response = auth_client.get(f"/api/files/{file_id}/versions")

    assert response.status_code == 502
    assert error_code(response) == "storage_error"


def test_listing_works_without_s3_configured(app, auth_client):
    """No `s3` fixture: DB-only endpoints must not need AWS settings."""
    app.config["S3_BUCKET_NAME"] = ""

    assert auth_client.get("/api/files").status_code == 200
    assert auth_client.get("/api/files/stats").status_code == 200
    response = request_upload(auth_client)
    assert response.status_code == 502
    assert "not configured" in response.get_json()["error"]["message"]


def test_direct_url_uses_custom_endpoint_for_local_emulator(app, auth_client, s3):
    body = upload(auth_client)
    app.config["S3_ENDPOINT_URL"] = "http://localhost:5001/"

    url = auth_client.get(f"/api/files/{body['file']['id']}/direct-url").get_json()["url"]

    assert url == f"http://localhost:5001/{TEST_BUCKET}/{body['file']['s3_key']}"
