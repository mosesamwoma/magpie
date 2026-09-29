import re
from urllib.parse import urlparse

_INVALID_HOST_CHARS = re.compile(r"[\s\"'<>\\^`{|}]")


def is_valid_url(url: str) -> bool:
    try:
        p = urlparse(url)
    except Exception:
        return False
    if p.scheme not in ("http", "https"):
        return False
    if not p.netloc or _INVALID_HOST_CHARS.search(p.netloc):
        return False
    if "." not in p.netloc and "localhost" not in p.netloc.lower():
        return False
    return True
