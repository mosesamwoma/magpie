import json
import os
import threading
import time

from flask import Blueprint, Response, jsonify, render_template, request, send_file
from yt_dlp.utils import DownloadCancelled

from .downloader import Downloader
from .jobs import job_store
from .utils import is_valid_url

bp = Blueprint("main", __name__)
dl = Downloader()

_PROGRESS_PUSH_INTERVAL = 0.2


@bp.route("/")
def index():
    return render_template("index.html")


@bp.route("/api/info", methods=["POST"])
def api_info():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()

    if not url:
        return jsonify({"error": "URL is required"}), 400
    if not is_valid_url(url):
        return jsonify({"error": "That doesn't look like a valid link"}), 400

    try:
        return jsonify(dl.get_info(url))
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/api/download", methods=["POST"])
def api_download():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    format_id = (data.get("format_id") or "").strip()
    mode = (data.get("mode") or "video").strip().lower()

    if not url:
        return jsonify({"error": "URL is required"}), 400
    if not is_valid_url(url):
        return jsonify({"error": "That doesn't look like a valid link"}), 400
    if mode not in ("video", "audio"):
        mode = "video"

    job_id = job_store.create()
    last_push_at = 0.0

    def on_progress(d):
        nonlocal last_push_at
        status = d.get("status")

        if status == "downloading":
            now = time.monotonic()
            if now - last_push_at < _PROGRESS_PUSH_INTERVAL:
                return
            last_push_at = now

            downloaded = d.get("downloaded_bytes") or 0
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            percent = round(downloaded / total * 100) if total else 0
            job_store.update(
                job_id,
                status="downloading",
                percent=percent,
                downloaded_bytes=downloaded,
                total_bytes=total,
                speed=d.get("speed"),
                eta=d.get("eta"),
            )
        elif status == "finished":
            job_store.update(job_id, status="processing", percent=100, speed=None, eta=None)
        elif status == "started":
            job_store.update(job_id, status="processing")
        elif status == "error":
            job_store.update(job_id, status="error", error="Download failed")

    def run():
        try:
            path, filename = dl.download(
                url, format_id, mode,
                progress_hook=on_progress,
                should_cancel=lambda: job_store.is_cancelled(job_id),
            )
            job_store.update(job_id, status="finished", percent=100, filepath=path, filename=filename)
        except DownloadCancelled:
            job_store.update(job_id, status="cancelled", error=None)
        except Exception as e:
            job_store.update(job_id, status="error", error=str(e))

    threading.Thread(target=run, daemon=True).start()
    return jsonify({"job_id": job_id})


@bp.route("/api/progress/<job_id>")
def api_progress(job_id):
    job = job_store.get(job_id)
    if job is None:
        return jsonify({"error": "Unknown or expired download"}), 404

    job.pop("filepath", None)
    job.pop("created_at", None)
    return jsonify(job)


@bp.route("/api/progress/<job_id>/stream")
def api_progress_stream(job_id):
    def sse(payload: dict) -> str:
        return f"data: {json.dumps(payload)}\n\n"

    def generate():
        while True:
            job = job_store.get(job_id)
            if job is None:
                yield sse({"error": "Unknown or expired download"})
                return

            payload = {k: v for k, v in job.items() if k not in ("filepath", "created_at")}
            yield sse(payload)

            if job["status"] in ("finished", "error", "cancelled"):
                return

            job_store.wait(job_id, timeout=15)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@bp.route("/api/cancel/<job_id>", methods=["POST"])
def api_cancel(job_id):
    job = job_store.get(job_id)
    if job is None:
        return jsonify({"error": "Unknown or expired download"}), 404
    if job["status"] in ("finished", "error", "cancelled"):
        return jsonify({"error": "That download already finished"}), 409

    job_store.request_cancel(job_id)
    job_store.update(job_id, status="cancelling")
    return jsonify({"status": "cancelling"})


@bp.route("/api/file/<job_id>")
def api_file(job_id):
    job = job_store.get(job_id)
    if job is None or job.get("status") != "finished" or not job.get("filepath"):
        return jsonify({"error": "That file isn't ready yet"}), 404

    path = job["filepath"]
    if not os.path.exists(path):
        job_store.delete(job_id)
        return jsonify({"error": "That file is no longer available"}), 404

    response = send_file(path, as_attachment=True, download_name=job.get("filename"))
    job_store.delete(job_id)
    return response
