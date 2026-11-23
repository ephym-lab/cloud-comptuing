"""Security helpers: password hashing and one-time token generation.

Raw tokens are only ever sent to the user (in an email link). The database stores
a SHA-256 hash, so a database leak does not expose usable tokens.
"""

import hashlib
import secrets
from functools import cache

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


@cache
def dummy_password_hash() -> str:
    """A real hash used when the user doesn't exist, so login takes the same time
    whether or not the email is registered (prevents user enumeration by timing)."""
    return _hasher.hash(secrets.token_urlsafe(16))


def generate_token() -> str:
    """URL-safe random token with 256 bits of entropy."""
    return secrets.token_urlsafe(32)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
