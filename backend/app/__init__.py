import os
import threading

from flask import Flask

from .cleanup import cleanup_old_files
from .config import CLEANUP_AFTER_MINUTES, FLASK_DEBUG, MAX_CONTENT_LENGTH
from .jobs import job_store
from .routes import bp


def _start_cleanup_scheduler():
    interval_seconds = max(CLEANUP_AFTER_MINUTES, 1) * 60

    def run():
        try:
            cleanup_old_files()
            job_store.purge_stale(max_age_seconds=interval_seconds * 2)
        except Exception:
            pass
        finally:
            timer = threading.Timer(interval_seconds, run)
            timer.daemon = True
            timer.start()

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

    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
    app.register_blueprint(bp)

    is_reloader_child = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    if not FLASK_DEBUG or is_reloader_child:
        _start_cleanup_scheduler()

    return app
