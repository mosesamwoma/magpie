# Magpie

A self-hosted YouTube downloader. Paste a link, pick a quality, and get the
video — or strip it down to just the audio as an MP3.

## Features

- Fetch a video's title, thumbnail, uploader, and duration before downloading anything
- Download the full video at any available quality, or extract audio as a real MP3
- Live progress pushed over Server-Sent Events — real byte counts, speed, and ETA while the file downloads
- Cancel an in-progress download
- Codec and container badges next to the quality picker (H.264, AV1, Opus, AAC, etc.)
- Remembers your last-used mode and quality in the browser
- Single-page frontend, no build step, no frontend framework
- Automatic cleanup of old downloads and abandoned jobs after a configurable time
- Optional cookie authentication (a portable `cookies.txt`, or auto-detection across every major browser) to avoid YouTube's bot-detection errors
- Docker and docker-compose support, ffmpeg included

## Requirements

- Python 3.9+
- [ffmpeg](https://ffmpeg.org/) — required by yt-dlp to merge video/audio streams and to convert audio to MP3

## Setup

```bash
git clone https://github.com/mosesamwoma/magpie.git
cd magpie/backend

python -m venv venv
source venv/bin/activate

pip install -r requirements.txt --upgrade
```

Copy the example environment file and adjust as needed:

```bash
cp .env.example .env
```

| Variable                | Default    | Description                                                                                     |
|--------------------------|------------|---------------------------------------------------------------------------------------------------|
| `DOWNLOAD_DIR`            | `downloads`| Where downloaded files are stored                                                                 |
| `MAX_FILESIZE_MB`         | `500`      | Max allowed download size                                                                          |
| `CLEANUP_AFTER_MINUTES`   | `30`       | Auto-delete files (and abandoned jobs) older than this                                             |
| `FLASK_PORT`              | `5000`     | Port the app runs on                                                                                |
| `FLASK_DEBUG`             | `False`    | Flask debug mode — leave off in production                                                          |
| `COOKIES_FILE`            | *(empty)*  | Path to a `cookies.txt` file — portable across OS and browser, recommended if you need cookies at all |
| `COOKIES_FROM_BROWSER`    | *(empty)*  | `auto` to try every installed browser automatically, or a specific one (`chrome`, `firefox`, etc.) — ignored if `COOKIES_FILE` is set |

## Running

```bash
cd backend
source venv/bin/activate
python run.py
```

Open `http://localhost:5000`.

For production, use gunicorn instead of the dev server (a `Procfile` is included for platforms like Heroku/Render). The `--worker-class gthread --threads 8 --timeout 0` flags matter here — the live-progress connection is long-lived, and the default sync worker with a 30s timeout will kill it mid-download:

```bash
gunicorn run:app --bind 0.0.0.0:$PORT --worker-class gthread --workers 1 --threads 8 --timeout 0
```

### Running with Docker

```bash
docker compose up --build
```

This builds the image (Python + ffmpeg), mounts `./downloads` on the host, and serves the app on `http://localhost:5000`. Environment variables are read from `backend/.env` if present (copy `backend/.env.example` there first) — it's optional, sensible defaults apply without one.

## How it works

Downloading a video takes longer than any single HTTP request should stay
open for, so it doesn't happen inside one:

1. `POST /api/download` starts the download in a background thread and
   immediately returns a `job_id`.
2. The page opens `GET /api/progress/<job_id>/stream`, a Server-Sent Events
   connection. yt-dlp reports real byte counts, speed, and ETA via its
   `progress_hooks`, which land in an in-memory job store and get pushed to
   the browser the moment they change (a plain JSON
   `GET /api/progress/<job_id>` is also available for polling, if you're
   integrating something that doesn't speak SSE).
3. `POST /api/cancel/<job_id>` sets a flag the download thread checks on its
   next progress tick; yt-dlp aborts cleanly via its own `DownloadCancelled`
   mechanism and any partial file is deleted.
4. Once the job's status is `finished`, the page fetches
   `GET /api/file/<job_id>`, and the browser's own download manager takes
   it from there. The job entry (and eventually the file itself) is cleaned
   up afterward.

Video downloads always merge in the best available audio track — most
YouTube resolutions above 360p are video-only streams, so picking a
resolution alone would otherwise produce a silent file.

## Notes

- The job store is in-memory and per-process — fine for a single personal
  instance. If you run multiple gunicorn workers, downloads and progress
  requests for the same job need to land on the same worker; keep it to a
  single worker/thread unless you swap the job store for something shared
  (Redis, etc.).
- If you put this behind a reverse proxy (nginx, Cloudflare, etc.), make
  sure it doesn't buffer or time out long-lived SSE connections — nginx in
  particular needs `proxy_buffering off;` on the `/api/progress/*/stream`
  location.
- Downloaded files are personal-use only — respect copyright and the terms
  of service of whatever site you're pulling from.
