import yt_dlp
import os
import uuid
from .config import DOWNLOAD_DIR, MAX_FILESIZE_MB

class Downloader:
    def __init__(self):
        os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    def get_info(self, url: str) -> dict:
        opts = {"quiet": True, "no_warnings": True, "skip_download": True}
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)

        formats, seen = [], set()
        for f in info.get("formats", []):
            if f.get("vcodec") == "none" and f.get("acodec") == "none":
                continue
            label = f.get("format_note") or f.get("resolution") or f.get("format_id")
            if label in seen:
                continue
            seen.add(label)
            formats.append({
                "id": f["format_id"],
                "label": label,
                "ext": f.get("ext"),
                "filesize": f.get("filesize"),
            })

        return {
            "title": info.get("title"),
            "duration": info.get("duration"),
            "thumbnail": info.get("thumbnail"),
            "uploader": info.get("uploader"),
            "formats": formats,
        }

    def download(self, url: str, format_id: str) -> str:
        job_id = str(uuid.uuid4())[:8]
        outtmpl = os.path.join(DOWNLOAD_DIR, f"{job_id}_%(title)s.%(ext)s")
        opts = {
            "format": format_id or "bestvideo+bestaudio/best",
            "outtmpl": outtmpl,
            "merge_output_format": "mp4",
            "max_filesize": MAX_FILESIZE_MB * 1024 * 1024,
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            return ydl.prepare_filename(info)
