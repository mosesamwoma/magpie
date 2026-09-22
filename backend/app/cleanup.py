import os
import time
from .config import DOWNLOAD_DIR, CLEANUP_AFTER_MINUTES

def cleanup_old_files():
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    now = time.time()
    cutoff = CLEANUP_AFTER_MINUTES * 60
    for name in os.listdir(DOWNLOAD_DIR):
        if name.startswith("."):
            continue
        path = os.path.join(DOWNLOAD_DIR, name)
        try:
            if os.path.isfile(path) and now - os.path.getmtime(path) > cutoff:
                os.remove(path)
        except OSError:
            pass

if __name__ == "__main__":
    cleanup_old_files()
