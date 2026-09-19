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

        raw_formats = info.get("formats", [])
        raw_formats.sort(
            key=lambda f: (-(f.get("height") or 0), -(f.get("abr") or f.get("tbr") or 0))
        )

        formats, seen = [], set()
        for f in raw_formats:
            if f.get("vcodec") == "none" and f.get("acodec") == "none":
                continue

            if f.get("language") is not None and (f.get("language_preference") or -1) < 0:
                continue

            is_audio_only = f.get("vcodec") == "none"

            if is_audio_only:
                abr = f.get("abr")
                label = f"{int(abr)} kbps" if abr else (f.get("format_note") or f.get("format_id"))
                fmt_type = "audio"
            else:
                height = f.get("height")
                if height:
                    label = f"{height}p"
                    fps = f.get("fps")
                    if fps and fps > 30:
                        label += str(int(fps))
                else:
                    label = f.get("format_note") or f.get("resolution") or f.get("format_id")
                fmt_type = "video"

            dedupe_key = (fmt_type, label, f.get("ext"))
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            formats.append({
                "id": f["format_id"],
                "label": label,
                "ext": f.get("ext"),
                "filesize": f.get("filesize") or f.get("filesize_approx"),
                "type": fmt_type,
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