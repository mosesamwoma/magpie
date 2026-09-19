import os

from flask import Blueprint, jsonify, render_template, request, send_file

from .downloader import Downloader
from .utils import is_valid_url

bp = Blueprint("main", __name__)
dl = Downloader()


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

    try:
        path = dl.download(url, format_id, mode)
        if not path or not os.path.exists(path):
            return jsonify({"error": "Download failed"}), 500
        return send_file(path, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
