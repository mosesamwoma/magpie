import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

DOWNLOAD_DIR = os.path.join(BASE_DIR, os.getenv("DOWNLOAD_DIR", "downloads"))
MAX_FILESIZE_MB = int(os.getenv("MAX_FILESIZE_MB", 500))
CLEANUP_AFTER_MINUTES = int(os.getenv("CLEANUP_AFTER_MINUTES", 30))
FLASK_PORT = int(os.getenv("FLASK_PORT", 5000))
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "False").lower() == "true"

COOKIES_FILE = os.getenv("COOKIES_FILE", "").strip() or None
if COOKIES_FILE and not os.path.isabs(COOKIES_FILE):
    COOKIES_FILE = os.path.join(BASE_DIR, COOKIES_FILE)

COOKIES_FROM_BROWSER = (os.getenv("COOKIES_FROM_BROWSER", "").strip() or None)
if COOKIES_FROM_BROWSER:
    COOKIES_FROM_BROWSER = COOKIES_FROM_BROWSER.lower()

YTDLP_PROXY = os.getenv("YTDLP_PROXY", "").strip() or None
