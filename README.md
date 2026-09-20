# Magpie

A self-hosted YouTube downloader. Paste a link, pick a quality, and get the video — or strip it down to just the audio as an MP3.

## Features

- Fetch a video's title, thumbnail, uploader, and duration before downloading anything
- Download the full video at any available quality, or extract audio as a real MP3
- Live progress — real byte counts, speed, and ETA while the file downloads, not a fake progress bar
- Single-page frontend, no build step, no frontend framework
- Automatic cleanup of old downloads and abandoned jobs after a configurable time
- Optional cookie authentication (a portable `cookies.txt`, or auto-detection across every major browser) to avoid YouTube's bot-detection errors

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

For production, use gunicorn instead of the dev server (a `Procfile` is included for platforms like Heroku/Render):

```bash
gunicorn run:app --bind 0.0.0.0:$PORT
```

## How it works

Downloading a video takes longer than any single HTTP request should stay open for, so it doesn't happen inside one:

1. `POST /api/download` starts the download in a background thread and immediately returns a `job_id`.
2. The page polls `GET /api/progress/<job_id>` every ~700ms. yt-dlp reports real byte counts, speed, and ETA via its `progress_hooks`, which land straight in an in-memory job store and back out to the browser.
3. Once the job's status is `finished`, the page fetches `GET /api/file/<job_id>`, and the browser's own download manager takes it from there. The job entry (and eventually the file itself) is cleaned up afterward.

Video downloads always merge in the best available audio track — most YouTube resolutions above 360p are video-only streams, so picking a resolution alone would otherwise produce a silent file.

## Notes

- The job store is in-memory and per-process — fine for a single personal instance. If you run multiple gunicorn workers, downloads and progress polling for the same job need to land on the same worker; keep it to a single worker/thread unless you swap the job store for something shared (Redis, etc.).
- Downloaded files are personal-use only — respect copyright and the terms of service of whatever site you're pulling from.