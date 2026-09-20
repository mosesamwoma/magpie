import os
import threading

from flask import Flask

from .cleanup import cleanup_old_files
from .config import CLEANUP_AFTER_MINUTES
from .jobs import job_store
from .routes import bp


def _start_cleanup_scheduler():
    interval_seconds = max(CLEANUP_AFTER_MINUTES, 1) * 60

    def run():
        try:
            cleanup_old_files()
            job_store.purge_stale(max_age_seconds=interval_seconds * 2)
        except Exception:
            # A single bad sweep (missing dir, permission error, anything)
            # must never stop future cleanups from being scheduled.
            pass
        finally:
            timer = threading.Timer(interval_seconds, run)
            timer.daemon = True
            timer.start()

    # Sweep once immediately so leftovers from before a restart don't sit
    # around for up to CLEANUP_AFTER_MINUTES before the first scheduled run.
    try:
        cleanup_old_files()
        job_store.purge_stale(max_age_seconds=interval_seconds * 2)
    except Exception:
        pass

    initial_timer = threading.Timer(interval_seconds, run)
    initial_timer.daemon = True
    initial_timer.start()


def create_app():
    frontend_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
    )

    app = Flask(
        __name__,
        template_folder=os.path.join(frontend_dir, "templates"),
        static_folder=os.path.join(frontend_dir, "static"),
        static_url_path="/static",
    )

    app.register_blueprint(bp)

    is_reloader_child = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    if not app.debug or is_reloader_child:
        _start_cleanup_scheduler()

    return app
