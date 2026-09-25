# Magpie

A self-hosted YouTube downloader. Paste a link, pick a quality, and get the
video — or strip it down to just the audio as an MP3.

## Features

- Fetch a video's title, thumbnail, uploader, and duration before downloading anything
- Download the full video at any available quality, or extract audio as a real MP3
- Video downloads always merge in the best available audio track — most YouTube
  resolutions above 360p are video-only streams, so picking a resolution alone
  would otherwise produce a silent file
- Live progress pushed over Server-Sent Events — real byte counts, speed, and ETA
  while the file downloads
- Cancel an in-progress download
- Codec and container badges next to the quality picker (H.264, AV1, Opus, AAC, etc.),
  plus the format's file size shown right in the picker before you download
- Formats larger than `MAX_FILESIZE_MB` are shown but greyed out and marked
  "Too large" in the quality picker, so oversized options are visibly
  disabled up front instead of failing partway through a download
- MP4-only and "max quality" filters for the format list
- Paste-from-clipboard and copy-title/copy-thumbnail buttons
- Recent-link suggestions under the URL field, plus a full download history
  panel — stored in the browser and mirrored to a small file on the server,
  so it survives clearing site data or switching browsers/devices on the
  same instance
- Toast notifications and inline status messages for errors, rate limits, and
  completed downloads
- Remembers your last-used mode and quality in the browser
- Installable as a PWA (Add to Home Screen / desktop install prompt), with a
  service worker that caches the app shell and shows an offline page when
  there's no connection — the download itself still needs a live connection,
  offline support only covers the app UI
- The footer shows the running yt-dlp version and when it was last checked,
  so it's obvious at a glance if it's gone stale
- If something in the environment is misconfigured but not fatal (an
  unwritable folder, a `COOKIES_FILE` path that doesn't exist), a dismissible
  warning banner shows up in the UI instead of just failing silently later
- Single-page frontend, no build step, no frontend framework
- Automatic cleanup of old downloads and abandoned jobs after a configurable time
- Optional cookie authentication (a portable `cookies.txt`, or auto-detection across
  every major browser) to avoid YouTube's bot-detection errors
- Docker and docker-compose support, ffmpeg included

## Requirements

- Python 3.9+
- [ffmpeg](https://ffmpeg.org/) — required by yt-dlp to merge video/audio streams
  and to convert audio to MP3

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

| Variable                | Default     | Description                                                                                            |
|--------------------------|-------------|----------------------------------------------------------------------------------------------------------|
| `DOWNLOAD_DIR`          | `downloads` | Where downloaded files are stored                                                                        |
| `DATA_DIR`              | `data`      | Where the server-side download history (`history.json`) is stored                                        |
| `MAX_FILESIZE_MB`       | `500`       | Max allowed download size. Formats above this are shown disabled in the UI, and yt-dlp also enforces it   |
| `CLEANUP_AFTER_MINUTES` | `30`        | Auto-delete files (and abandoned jobs) older than this                                                   |
| `FLASK_PORT`            | `5000`      | Port the app runs on                                                                                      |
| `FLASK_DEBUG`           | `False`     | Flask debug mode — leave off in production                                                                |
| `MAX_CONTENT_LENGTH_KB` | `16`        | Max size (in KB) of an incoming API request body                                                          |
| `HISTORY_LIMIT`         | `50`        | Max number of entries kept in the server-side history file                                                |
| `INFO_CACHE_SECONDS`    | `120`       | How long a video-info lookup (`/api/info`) is cached per URL before re-extracting. `0` disables the cache  |
| `COOKIES_FILE`          | *(empty)*   | Path to a `cookies.txt` file — portable across OS and browser, recommended if you need cookies at all     |
| `COOKIES_FROM_BROWSER`  | *(empty)*   | `auto` to try every installed browser automatically, or a specific one (`chrome`, `firefox`, etc.) — ignored if `COOKIES_FILE` is set. Leave empty on a headless server with no browser installed; `auto` will otherwise probe 8 browser cookie stores (and log an error for each) on every request. |

Only genuinely fatal settings (an invalid port, a non-numeric size limit,
and so on) stop the app from starting at all. Recoverable problems — like
`DOWNLOAD_DIR` or `DATA_DIR` not being writable, or `COOKIES_FILE` pointing
at a file that doesn't exist — no longer fail silently: they're collected
and served from `GET /api/health`, and the frontend shows them as a
dismissible warning banner the first time the page loads.

## Running

```bash
cd backend
source venv/bin/activate
python run.py
```

Open `http://localhost:5000`.

For production, use gunicorn instead of the dev server (a `Procfile` is included
for platforms like Heroku/Render). The `--worker-class gthread --threads 8
--timeout 0` flags matter here — the live-progress connection is long-lived, and
the default sync worker with a 30s timeout will kill it mid-download:

```bash
gunicorn run:app --bind 0.0.0.0:$PORT --worker-class gthread --workers 1 --threads 8 --timeout 0
```

### Running with Docker

```bash
docker compose up --build
```

This builds the image (Python + ffmpeg), mounts `./downloads` and `./data` on
the host, and serves the app on `http://localhost:5000`. Environment
variables are read from `backend/.env` if present (copy `backend/.env.example`
there first) — it's optional, sensible defaults apply without one.

## How it works

Downloading a video takes longer than any single HTTP request should stay open
for, so it doesn't happen inside one:

1. `POST /api/download` starts the download in a background thread and
   immediately returns a `job_id`.
2. The page opens `GET /api/progress/<job_id>/stream`, a Server-Sent Events
   connection. yt-dlp reports real byte counts, speed, and ETA via its
   `progress_hooks`, which land in an in-memory job store and get pushed to the
   browser the moment they change (a plain JSON `GET /api/progress/<job_id>` is
   also available for polling, if you're integrating something that doesn't
   speak SSE).
3. `POST /api/cancel/<job_id>` sets a flag the download thread checks on its
   next progress tick; yt-dlp aborts cleanly via its own `DownloadCancelled`
   mechanism and any partial file is deleted.
4. Once the job's status is `finished`, the page fetches `GET /api/file/<job_id>`,
   and the browser's own download manager takes it from there. The job entry
   (and eventually the file itself) is cleaned up afterward.

`POST /api/info` (fetching a video's title/thumbnail/formats before downloading)
is cached per-URL in memory for `INFO_CACHE_SECONDS` — so re-pasting the same
link, or switching between the video/audio tabs, doesn't re-run a full yt-dlp
extraction each time.

## Download history

History entries (URL, title, thumbnail, mode, timestamp) are written to
`localStorage` on every completed download, which is what powers the "recent
links" dropdown and the history panel. Each entry is also POSTed to
`GET/POST/DELETE /api/history`, which appends it to a small JSON file at
`DATA_DIR/history.json` (capped at `HISTORY_LIMIT` entries, oldest dropped
first). On page load the browser fetches that server copy and merges it into
`localStorage` by URL, keeping whichever version of each entry has the newer
timestamp — so history isn't lost if you clear site data or open the app from
a different browser on the same instance. This is all server-side JSON, not a
database: it's meant for a single personal instance, same as the job store
below.

## PWA / offline support

The manifest, icons, and a service worker (`frontend/static/js/sw.js`, served
at the root URL `/sw.js` so it can control the whole app rather than just
`/static/`) make Magpie
installable from the browser's "Install app" prompt. The service worker
precaches the app shell (HTML, CSS, JS, manifest) and an offline fallback
page, and serves that fallback if a page navigation fails while offline. It
never touches `/api/*` requests, so it can't mask a real backend error as a
network issue. Fetching video info and downloading still require an actual
connection — the offline page just means you get a clear "you're offline"
screen instead of a browser error page if you open the app with no
connection.

## Keeping it working: update yt-dlp regularly

**yt-dlp is the single piece most likely to break, and it's not a bug in this
app when it does.** YouTube actively and frequently changes its site
specifically to break extraction tools. When that happens you'll typically see
errors like "Unable to extract...", a format that suddenly returns no
formats, or "Sign in to confirm you're not a bot" — even though nothing in
your own setup changed. The yt-dlp maintainers usually ship a fix within a day
or two of YouTube breaking something, so the fix is almost always to update:

```bash
# venv install
pip install -U yt-dlp

# Docker — rebuild so the image picks up the latest release
docker compose build --no-cache
docker compose up -d
```

`requirements.txt` pins only a minimum yt-dlp version (`>=`), so
`pip install -r requirements.txt --upgrade` always pulls the latest — but a
Docker image bakes in whatever version was current at build time, so it won't
update itself. Rebuild every couple of weeks, or immediately if downloads
suddenly start failing. If you keep hitting "Could not process that link"
after updating, it's almost always this — run `pip install -U yt-dlp` (or
rebuild the Docker image) before looking anywhere else. The currently running
version is always visible in the app's footer and at `GET /api/health`.

## Notes

- The job store (in-progress downloads and their live progress) is in-memory
  and per-process — fine for a single personal instance. If you run multiple
  gunicorn workers, downloads and progress requests for the same job need to
  land on the same worker; keep it to a single worker/thread unless you swap
  the job store for something shared (Redis, etc.). The download history
  file (`DATA_DIR/history.json`) doesn't have this limitation, since it's
  written to disk rather than kept in memory, but it also isn't
  lock-coordinated beyond a single process — fine for the same
  single-worker deployment this project targets.
- If you put this behind a reverse proxy (nginx, Cloudflare, etc.), make sure
  it doesn't buffer or time out long-lived SSE connections — nginx in
  particular needs `proxy_buffering off;` on the `/api/progress/*/stream`
  location.
- Downloaded files are personal-use only — respect copyright and the terms of
  service of whatever site you're pulling from.
