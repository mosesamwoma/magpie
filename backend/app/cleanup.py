import os
import time
from .config import DOWNLOAD_DIR, CLEANUP_AFTER_MINUTES

def cleanup_old_files():
    now = time.time()
    cutoff = CLEANUP_AFTER_MINUTES * 60
    for name in os.listdir(DOWNLOAD_DIR):
        path = os.path.join(DOWNLOAD_DIR, name)
        if os.path.isfile(path) and now - os.path.getmtime(path) > cutoff:
            os.remove(path)

if __name__ == "__main__":
    cleanup_old_files()
