import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._lock = threading.Lock()
        self._hits = defaultdict(deque)

    def _prune(self, hits, now: float) -> None:
        while hits and now - hits[0] > self._window_seconds:
            hits.popleft()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            self._prune(hits, now)
            if len(hits) >= self._max_requests:
                return False
            hits.append(now)
            return True

    def retry_after(self, key: str) -> float:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            self._prune(hits, now)
            if not hits or len(hits) < self._max_requests:
                return 0.0
            return max(0.0, self._window_seconds - (now - hits[0]))
