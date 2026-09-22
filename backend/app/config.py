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
MAX_FILESIZE_MB = _int_env("MAX_FILESIZE_MB", 500)
CLEANUP_AFTER_MINUTES = _int_env("CLEANUP_AFTER_MINUTES", 30)
FLASK_PORT = _int_env("FLASK_PORT", 5000)
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "False").lower() == "true"

MAX_CONTENT_LENGTH = _int_env("MAX_CONTENT_LENGTH_KB", 16) * 1024

if MAX_FILESIZE_MB <= 0:
    sys.exit(f"Invalid value for MAX_FILESIZE_MB: {MAX_FILESIZE_MB} — must be greater than 0")
if CLEANUP_AFTER_MINUTES <= 0:
    sys.exit(f"Invalid value for CLEANUP_AFTER_MINUTES: {CLEANUP_AFTER_MINUTES} — must be greater than 0")
if not (1 <= FLASK_PORT <= 65535):
    sys.exit(f"Invalid value for FLASK_PORT: {FLASK_PORT} — must be between 1 and 65535")
if MAX_CONTENT_LENGTH <= 0:
    sys.exit("Invalid value for MAX_CONTENT_LENGTH_KB — must be greater than 0")

COOKIES_FILE = os.getenv("COOKIES_FILE", "").strip() or None
if COOKIES_FILE and not os.path.isabs(COOKIES_FILE):
    COOKIES_FILE = os.path.join(BASE_DIR, COOKIES_FILE)

COOKIES_FROM_BROWSER = (os.getenv("COOKIES_FROM_BROWSER", "").strip() or None)
if COOKIES_FROM_BROWSER:
    COOKIES_FROM_BROWSER = COOKIES_FROM_BROWSER.lower()
