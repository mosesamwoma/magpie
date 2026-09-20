import threading
import time
import uuid


class JobStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._jobs = {}

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
        return job_id

    def update(self, job_id: str, **fields) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None:
                job.update(fields)

    def get(self, job_id: str):
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job is not None else None

    def delete(self, job_id: str) -> None:
        with self._lock:
            self._jobs.pop(job_id, None)

    def purge_stale(self, max_age_seconds: int = 3600) -> None:
        cutoff = time.time() - max_age_seconds
        with self._lock:
            stale = [jid for jid, job in self._jobs.items() if job["created_at"] < cutoff]
            for jid in stale:
                del self._jobs[jid]


job_store = JobStore()
