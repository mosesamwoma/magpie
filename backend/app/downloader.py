import glob
import os
import shutil
import uuid
from typing import Optional

import yt_dlp
from yt_dlp.utils import DownloadCancelled, DownloadError

from .config import COOKIES_FILE, COOKIES_FROM_BROWSER, DOWNLOAD_DIR, MAX_FILESIZE_MB

_INCOMPLETE_SUFFIXES = (".part", ".ytdl", ".part-Frag", ".temp")

_AUTO_BROWSERS = (
    "chrome", "edge", "brave", "chromium", "firefox", "vivaldi", "opera", "safari",
)

_VIDEO_CODEC_LABELS = (
    ("av01", "AV1"),
    ("vp09", "VP9"),
    ("vp9", "VP9"),
    ("avc1", "H.264"),
    ("h264", "H.264"),
    ("hev1", "HEVC"),
    ("hvc1", "HEVC"),
)

_AUDIO_CODEC_LABELS = (
    ("opus", "Opus"),
    ("mp4a", "AAC"),
    ("mp3", "MP3"),
    ("vorbis", "Vorbis"),
    ("ac-3", "AC-3"),
    ("ec-3", "EAC-3"),
)


def _codec_label(codec: Optional[str], labels) -> Optional[str]:
    if not codec or codec == "none":
        return None
    codec_lower = codec.lower()
    for prefix, label in labels:
        if codec_lower.startswith(prefix):
            return label
    return codec.split(".")[0].upper()


class Downloader:
    def __init__(self):
        os.makedirs(DOWNLOAD_DIR, exist_ok=True)
        self._writable_cookies_file = self._prepare_writable_cookies_file()

    def _prepare_writable_cookies_file(self) -> Optional[str]:
        if not COOKIES_FILE:
            return None
        writable_path = os.path.join(DOWNLOAD_DIR, ".cookies.txt")
        try:
            shutil.copyfile(COOKIES_FILE, writable_path)
        except OSError:
            return None
        return writable_path

    def _base_opts(self) -> dict:
        return {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "noprogress": True,
        }

    def _cookie_variants(self):
        if self._writable_cookies_file:
            yield {"cookiefile": self._writable_cookies_file}
            return

        if COOKIES_FROM_BROWSER == "auto":
            for browser in _AUTO_BROWSERS:
                yield {"cookiesfrombrowser": (browser,)}
            yield {}
            return

        if COOKIES_FROM_BROWSER:
            yield {"cookiesfrombrowser": (COOKIES_FROM_BROWSER,)}
            return

        yield {}

    def _run_with_cookie_fallback(self, run_once):
        variants = list(self._cookie_variants())
        for i, extra in enumerate(variants):
            try:
                return run_once(extra)
            except DownloadCancelled:
                raise
            except Exception:
                if i == len(variants) - 1:
                    raise
                continue

    def _raise_friendly_error(self, e: Exception):
        if isinstance(e, DownloadError) and "Sign in to confirm" in str(e):
            raise ValueError(
                "YouTube is blocking this request. Try refreshing the cookies file, "
                "or this video may be temporarily unavailable from this server."
            ) from e
        raise ValueError(
            "Could not process that link. It may be private, region-locked, "
            "or temporarily blocked by YouTube."
        ) from e

    def get_info(self, url: str) -> dict:
        def attempt(cookie_opts):
            opts = {**self._base_opts(), **cookie_opts, "skip_download": True}
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=False)

        try:
            info = self._run_with_cookie_fallback(attempt)
        except Exception as e:
            self._raise_friendly_error(e)

        if info is None:
            raise ValueError("Could not read video info for that link")

        is_playlist = info.get("_type") == "playlist"
        if is_playlist:
            entries = info.get("entries") or []
            if not entries:
                raise ValueError("That link points to a playlist, not a single video")
            info = entries[0]

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
                codec = _codec_label(f.get("acodec"), _AUDIO_CODEC_LABELS)
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
                codec = _codec_label(f.get("vcodec"), _VIDEO_CODEC_LABELS)

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
                "codec": codec,
                "height": f.get("height") if not is_audio_only else None,
            })

        return {
            "title": info.get("title"),
            "duration": info.get("duration"),
            "thumbnail": info.get("thumbnail"),
            "uploader": info.get("uploader"),
            "formats": formats,
            "is_playlist": is_playlist,
        }

    def download(self, url: str, format_id: str, mode: str = "video", progress_hook=None, should_cancel=None):
        file_id = str(uuid.uuid4())[:8]
        outtmpl = os.path.join(DOWNLOAD_DIR, f"{file_id}_%(title).150s.%(ext)s")

        base_opts = {
            **self._base_opts(),
            "outtmpl": outtmpl,
            "max_filesize": MAX_FILESIZE_MB * 1024 * 1024,
        }

        if mode == "audio":
            base_opts["format"] = format_id or "bestaudio/best"
            base_opts["postprocessors"] = [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }]
        else:
            base_opts["format"] = (
                f"{format_id}+bestaudio/best/{format_id}" if format_id else "bestvideo+bestaudio/best"
            )
            base_opts["merge_output_format"] = "mp4"

        def hook(d):
            if should_cancel and should_cancel():
                raise DownloadCancelled("Cancelled by user")
            if progress_hook:
                progress_hook(d)

        if progress_hook or should_cancel:
            base_opts["progress_hooks"] = [hook]
            base_opts["postprocessor_hooks"] = [hook]

        def attempt(cookie_opts):
            self._cleanup_job_files(file_id)
            opts = {**base_opts, **cookie_opts}
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.extract_info(url, download=True)

        try:
            self._run_with_cookie_fallback(attempt)
        except DownloadCancelled:
            self._cleanup_job_files(file_id)
            raise
        except Exception as e:
            self._cleanup_job_files(file_id)
            self._raise_friendly_error(e)

        result_path = self._find_finished_file(file_id)
        if not result_path:
            self._cleanup_job_files(file_id)
            raise RuntimeError("Download finished but the output file could not be found")

        display_name = os.path.basename(result_path)
        prefix = f"{file_id}_"
        if display_name.startswith(prefix):
            display_name = display_name[len(prefix):]

        return result_path, display_name

    def _find_finished_file(self, file_id: str) -> Optional[str]:
        candidates = [
            p for p in glob.glob(os.path.join(DOWNLOAD_DIR, f"{file_id}_*"))
            if os.path.isfile(p) and not p.endswith(_INCOMPLETE_SUFFIXES)
        ]
        if not candidates:
            return None
        candidates.sort(key=os.path.getmtime, reverse=True)
        return candidates[0]

    def _cleanup_job_files(self, file_id: str) -> None:
        for p in glob.glob(os.path.join(DOWNLOAD_DIR, f"{file_id}_*")):
            try:
                os.remove(p)
            except OSError:
                pass

    def version(self) -> str:
        try:
            from yt_dlp.version import __version__
            return __version__
        except ImportError:
            return "unknown"
