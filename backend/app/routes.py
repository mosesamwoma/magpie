from flask import Blueprint, request, jsonify, send_file, render_template, abort
from .downloader import Downloader
import os

bp = Blueprint("main", __name__)
dl = Downloader()

@bp.route("/")
def index():
    return render_template("index.html")

@bp.route("/api/info", methods=["POST"])
def api_info():
    data = request.get_json() or {}
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"error": "URL is required"}), 400
    try:
        return jsonify(dl.get_info(url))
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@bp.route("/api/download", methods=["POST"])
def api_download():
    data = request.get_json() or {}
    url = data.get("url", "").strip()
    format_id = data.get("format_id", "").strip()
    if not url:
        return jsonify({"error": "URL is required"}), 400
    try:
        path = dl.download(url, format_id)
        if not os.path.exists(path):
            abort(500, "Download failed")
        return send_file(path, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
