import threading
import time
import uuid


class JobStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._jobs = {}
        self._events = {}
        self._cancel_flags = {}

    def create(self) -> str:
        job_id = uuid.uuid4().hex
        with self._lock:
            self._jobs[job_id] = {
                "status": "starting",
                "percent": 0,
                "downloaded_bytes": 0,
                "total_bytes": 0,
                "speed": None,
                "eta": None,
                "error": None,
                "filepath": None,
                "filename": None,
                "created_at": time.time(),
            }
            self._events[job_id] = threading.Event()
            self._cancel_flags[job_id] = threading.Event()
        return job_id

    def update(self, job_id: str, **fields) -> None:
        event = None
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.update(fields)
                event = self._events.get(job_id)
        if event is not None:
            event.set()

    def get(self, job_id: str):
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job is not None else None

    def wait(self, job_id: str, timeout: float = 15.0) -> bool:
        with self._lock:
            event = self._events.get(job_id)
        if event is None:
            return False
        triggered = event.wait(timeout)
        if triggered:
            event.clear()
        return triggered

    def request_cancel(self, job_id: str) -> bool:
        with self._lock:
            flag = self._cancel_flags.get(job_id)
        if flag is None:
            return False
        flag.set()
        return True

    def is_cancelled(self, job_id: str) -> bool:
        with self._lock:
            flag = self._cancel_flags.get(job_id)
        return flag.is_set() if flag is not None else False

    def delete(self, job_id: str) -> None:
        with self._lock:
            self._jobs.pop(job_id, None)
            self._events.pop(job_id, None)
            self._cancel_flags.pop(job_id, None)

    def purge_stale(self, max_age_seconds: int = 3600) -> None:
        cutoff = time.time() - max_age_seconds
        with self._lock:
            stale = [jid for jid, job in self._jobs.items() if job["created_at"] < cutoff]
            for jid in stale:
                del self._jobs[jid]
                self._events.pop(jid, None)
                self._cancel_flags.pop(jid, None)


job_store = JobStore()
