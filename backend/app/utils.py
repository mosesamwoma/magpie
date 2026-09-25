import re
from urllib.parse import urlparse

# urlparse() is deliberately lenient (e.g. it happily accepts spaces in the
# host), so a pasted page title like "God-Tier Developer Roadmap" can pass
# it and only blow up later inside yt-dlp/requests with a raw traceback.
# Reject anything whose host clearly isn't a real hostname before it gets
# that far.
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
