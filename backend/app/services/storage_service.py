"""Thin wrapper around Amazon S3. This is the ONLY module that imports boto3.

The bucket is private, so the browser never gets AWS credentials. Instead the
backend signs short-lived URLs:
  - presigned POST → the browser uploads straight to S3 (bytes never touch Flask)
  - presigned GET  → the browser streams/downloads straight from S3

Credentials come from the standard AWS environment variables
(AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY), which boto3 reads on its own.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from flask import current_app

from app.utils.errors import StorageError

EXTENSION_KEY = "s3_client"
NOT_FOUND_CODES = {"404", "NoSuchKey", "NotFound", "NoSuchVersion"}


@dataclass(frozen=True)
class PresignedPost:
    url: str
    fields: dict[str, str]


@dataclass(frozen=True)
class ObjectInfo:
    size: int
    content_type: str
    version_id: str | None
    last_modified: datetime
    metadata: dict[str, str]


@dataclass(frozen=True)
class ObjectVersion:
    version_id: str
    is_latest: bool
    size: int
    last_modified: datetime


def _get_s3_client() -> Any:
    """One boto3 client per app, created on first use."""
    client = current_app.extensions.get(EXTENSION_KEY)
    if client is None:
        region = current_app.config["AWS_REGION"]
        if not region or not current_app.config["S3_BUCKET_NAME"]:
            raise StorageError("S3 is not configured: set AWS_REGION and S3_BUCKET_NAME.")
        client = boto3.client(
            "s3",
            region_name=region,
            # Regional endpoint + virtual-hosted URLs avoid redirects (and CORS failures)
            # for buckets outside us-east-1.
            endpoint_url=f"https://s3.{region}.amazonaws.com",
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
        )
        current_app.extensions[EXTENSION_KEY] = client
    return client


@contextmanager
def _s3_errors(action: str) -> Iterator[None]:
    """Turn boto3 exceptions into our StorageError (502) with a readable message."""
    try:
        yield
    except ClientError as err:
        code = err.response.get("Error", {}).get("Code", "Unknown")
        raise StorageError(f"S3 {action} failed ({code}).", {"aws_code": code}) from err
    except BotoCoreError as err:
        raise StorageError(f"S3 {action} failed: {err}") from err


def _is_not_found(err: ClientError) -> bool:
    return err.response.get("Error", {}).get("Code") in NOT_FOUND_CODES


class StorageService:
    def __init__(self, client: Any | None = None, bucket: str | None = None) -> None:
        self._client_override = client
        self._bucket = bucket or current_app.config["S3_BUCKET_NAME"]

    @property
    def _client(self) -> Any:
        """Resolved on first S3 call, so DB-only operations work without S3 configured."""
        return self._client_override or _get_s3_client()

    # --- Upload ---

    def create_presigned_post(
        self,
        key: str,
        content_type: str,
        max_bytes: int,
        expires_in: int,
        metadata: dict[str, str] | None = None,
    ) -> PresignedPost:
        """Signed form the browser can POST a file to. The policy pins the exact key,
        the Content-Type and the allowed size range, so the client can't change them."""
        fields: dict[str, str] = {"Content-Type": content_type}
        fields.update({f"x-amz-meta-{name}": value for name, value in (metadata or {}).items()})
        conditions: list[Any] = [{name: value} for name, value in fields.items()]
        conditions.append(["content-length-range", 1, max_bytes])

        with _s3_errors("presign upload"):
            result = self._client.generate_presigned_post(
                Bucket=self._bucket,
                Key=key,
                Fields=fields,
                Conditions=conditions,
                ExpiresIn=expires_in,
            )
        return PresignedPost(url=result["url"], fields=result["fields"])

    # --- Download / preview ---

    def create_presigned_get(
        self,
        key: str,
        expires_in: int,
        content_disposition: str,
        content_type: str | None = None,
        version_id: str | None = None,
    ) -> str:
        params: dict[str, str] = {
            "Bucket": self._bucket,
            "Key": key,
            "ResponseContentDisposition": content_disposition,
        }
        if content_type:
            params["ResponseContentType"] = content_type
        if version_id:
            params["VersionId"] = version_id

        with _s3_errors("presign download"):
            return self._client.generate_presigned_url(
                "get_object", Params=params, ExpiresIn=expires_in
            )

    def direct_url(self, key: str) -> str:
        """The plain, unsigned object URL. On a private bucket this returns Access Denied."""
        region = current_app.config["AWS_REGION"]
        return f"https://{self._bucket}.s3.{region}.amazonaws.com/{quote(key)}"

    # --- Object inspection ---

    def head_object(self, key: str) -> ObjectInfo | None:
        """Metadata of the current version, or None if the object doesn't exist."""
        try:
            response = self._client.head_object(Bucket=self._bucket, Key=key)
        except ClientError as err:
            if _is_not_found(err):
                return None
            raise StorageError("S3 head_object failed.") from err
        except BotoCoreError as err:
            raise StorageError(f"S3 head_object failed: {err}") from err

        return ObjectInfo(
            size=response["ContentLength"],
            content_type=response.get("ContentType", ""),
            version_id=response.get("VersionId"),
            last_modified=response["LastModified"],
            metadata=response.get("Metadata", {}),
        )

    def list_versions(self, key: str) -> list[ObjectVersion]:
        """Every stored version of this exact key, newest first (delete markers excluded)."""
        versions: list[ObjectVersion] = []
        with _s3_errors("list versions"):
            paginator = self._client.get_paginator("list_object_versions")
            # Prefix also matches longer keys (e.g. "a.png" matches "a.png.bak"), so filter.
            for page in paginator.paginate(Bucket=self._bucket, Prefix=key):
                versions.extend(
                    ObjectVersion(
                        version_id=item["VersionId"],
                        is_latest=item["IsLatest"],
                        size=item["Size"],
                        last_modified=item["LastModified"],
                    )
                    for item in page.get("Versions", [])
                    if item["Key"] == key
                )
        # Latest first even if timestamps tie (S3 LastModified has 1-second resolution).
        return sorted(versions, key=lambda v: (v.is_latest, v.last_modified), reverse=True)

    # --- Changes ---

    def restore_version(self, key: str, version_id: str) -> str:
        """Copy an old version on top of the key, making it the newest version.
        History is kept: nothing is deleted. Returns the new version id."""
        with _s3_errors("restore version"):
            response = self._client.copy_object(
                Bucket=self._bucket,
                Key=key,
                CopySource={"Bucket": self._bucket, "Key": key, "VersionId": version_id},
                MetadataDirective="COPY",
            )
        return response.get("VersionId", "")

    def delete_object(self, key: str) -> None:
        """With versioning on, this adds a delete marker; older versions remain in S3."""
        with _s3_errors("delete"):
            self._client.delete_object(Bucket=self._bucket, Key=key)
