from typing import Any

from flask import request
from marshmallow import Schema


def load_json(schema: Schema) -> dict[str, Any]:
    """Validate the JSON request body. A missing/invalid body validates as `{}`,
    so the client gets field-level "required" errors instead of a generic 400."""
    payload = request.get_json(silent=True)
    return schema.load(payload if payload is not None else {})
