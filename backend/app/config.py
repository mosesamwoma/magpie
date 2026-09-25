import os
import sys
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw.strip())
    except ValueError:
        sys.exit(f"Invalid value for {name}: {raw!r} — expected a whole number")


DOWNLOAD_DIR = os.path.join(BASE_DIR, os.getenv("DOWNLOAD_DIR", "downloads"))
DATA_DIR = os.path.join(BASE_DIR, os.getenv("DATA_DIR", "data"))
MAX_FILESIZE_MB = _int_env("MAX_FILESIZE_MB", 500)
CLEANUP_AFTER_MINUTES = _int_env("CLEANUP_AFTER_MINUTES", 30)
FLASK_PORT = _int_env("FLASK_PORT", 5000)
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "False").lower() == "true"
HISTORY_LIMIT = _int_env("HISTORY_LIMIT", 50)
INFO_CACHE_SECONDS = _int_env("INFO_CACHE_SECONDS", 120)

MAX_CONTENT_LENGTH = _int_env("MAX_CONTENT_LENGTH_KB", 16) * 1024

if MAX_FILESIZE_MB <= 0:
    sys.exit(f"Invalid value for MAX_FILESIZE_MB: {MAX_FILESIZE_MB} — must be greater than 0")
if CLEANUP_AFTER_MINUTES <= 0:
    sys.exit(f"Invalid value for CLEANUP_AFTER_MINUTES: {CLEANUP_AFTER_MINUTES} — must be greater than 0")
if not (1 <= FLASK_PORT <= 65535):
    sys.exit(f"Invalid value for FLASK_PORT: {FLASK_PORT} — must be between 1 and 65535")
if MAX_CONTENT_LENGTH <= 0:
    sys.exit("Invalid value for MAX_CONTENT_LENGTH_KB — must be greater than 0")
if HISTORY_LIMIT <= 0:
    sys.exit(f"Invalid value for HISTORY_LIMIT: {HISTORY_LIMIT} — must be greater than 0")
if INFO_CACHE_SECONDS < 0:
    sys.exit(f"Invalid value for INFO_CACHE_SECONDS: {INFO_CACHE_SECONDS} — must be zero or greater")

COOKIES_FILE = os.getenv("COOKIES_FILE", "").strip() or None
if COOKIES_FILE and not os.path.isabs(COOKIES_FILE):
    COOKIES_FILE = os.path.join(BASE_DIR, COOKIES_FILE)

COOKIES_FROM_BROWSER = (os.getenv("COOKIES_FROM_BROWSER", "").strip() or None)
if COOKIES_FROM_BROWSER:
    COOKIES_FROM_BROWSER = COOKIES_FROM_BROWSER.lower()

YOUTUBE_PLAYER_CLIENTS = [
    c.strip() for c in os.getenv("YOUTUBE_PLAYER_CLIENTS", "").split(",") if c.strip()
]

CONFIG_WARNINGS = []


def _check_writable_dir(path: str, label: str) -> None:
    try:
        os.makedirs(path, exist_ok=True)
        probe_path = os.path.join(path, ".magpie-write-test")
        with open(probe_path, "w") as probe_file:
            probe_file.write("ok")
        os.remove(probe_path)
    except OSError:
        CONFIG_WARNINGS.append(f"{label} ({path}) is not writable — check permissions.")


_check_writable_dir(DOWNLOAD_DIR, "Download directory")
_check_writable_dir(DATA_DIR, "Data directory")

if COOKIES_FILE and not os.path.isfile(COOKIES_FILE):
    CONFIG_WARNINGS.append(f"COOKIES_FILE is set to {COOKIES_FILE}, but no file exists there.")
