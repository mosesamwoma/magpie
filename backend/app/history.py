import json
import math
import os
import threading
import time
from typing import Optional

from .config import DATA_DIR, HISTORY_LIMIT

_LOCK = threading.Lock()
_HISTORY_FILE = os.path.join(DATA_DIR, "history.json")

_ALLOWED_MODES = ("video", "audio")
_MAX_STRING_LEN = 500
_MAX_URL_LEN = 2000


def _ensure_data_dir() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)


def _read_all() -> list:
    _ensure_data_dir()
    if not os.path.exists(_HISTORY_FILE):
        return []
    try:
        with open(_HISTORY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def _write_all(entries: list) -> None:
    _ensure_data_dir()
    tmp_path = f"{_HISTORY_FILE}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(entries, f)
    os.replace(tmp_path, _HISTORY_FILE)


def _clean_string(value, max_len: int = _MAX_STRING_LEN) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:max_len]


def _sanitize_entry(raw: dict) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None

    url = _clean_string(raw.get("url"), _MAX_URL_LEN)
    if not url:
        return None

    mode = _clean_string(raw.get("mode"), 10).lower()
    if mode not in _ALLOWED_MODES:
        mode = "video"

    title = _clean_string(raw.get("title")) or url
    thumbnail = _clean_string(raw.get("thumbnail"), _MAX_URL_LEN)

    timestamp = raw.get("timestamp")
    if (
        isinstance(timestamp, bool)
        or not isinstance(timestamp, (int, float))
        or not math.isfinite(timestamp)
    ):
        timestamp = time.time() * 1000
    timestamp = int(timestamp)

    return {
        "url": url,
        "title": title,
        "thumbnail": thumbnail,
        "mode": mode,
        "timestamp": timestamp,
    }


def add_entry(raw: dict) -> Optional[dict]:
    entry = _sanitize_entry(raw)
    if entry is None:
        return None

    with _LOCK:
        entries = [
            e for e in _read_all()
            if isinstance(e, dict) and e.get("url") != entry["url"]
        ]
        entries.insert(0, entry)
        entries = entries[:HISTORY_LIMIT]
        _write_all(entries)
    return entry


def list_entries() -> list:
    with _LOCK:
        return _read_all()


def clear() -> None:
    with _LOCK:
        _write_all([])
