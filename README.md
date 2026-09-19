# Magpie

A self-hosted video downloader. Paste a YouTube link, pick a quality, and download the video — or grab just the audio as an MP3.

## Features

- Fetch video metadata (title, thumbnail, uploader, duration) before downloading
- Download full video in your choice of quality
- Extract audio only (MP3)
- Simple, single-page frontend — no build step required
- Automatic cleanup of old downloads after a configurable time

## Requirements

- Python 3.9+
- [ffmpeg](https://ffmpeg.org/) (needed by yt-dlp to merge video/audio and to convert to MP3)
- A Chromium- or Firefox-based browser installed locally, logged into YouTube (used for `cookiesfrombrowser` to avoid YouTube's bot-detection "Please sign in" errors)

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

| Variable                | Default    | Description                                   |
|--------------------------|------------|------------------------------------------------|
| `DOWNLOAD_DIR`            | `downloads`| Where downloaded files are stored               |
| `MAX_FILESIZE_MB`         | `500`      | Max allowed download size                        |
| `CLEANUP_AFTER_MINUTES`   | `30`       | Auto-delete files older than this                |
| `FLASK_PORT`              | `5000`     | Port the app runs on                             |
| `FLASK_DEBUG`             | `True`     | Flask debug mode                                 |

## Running

```bash
cd backend
python run.py
```

Visit `http://127.0.0.1:5000` in your browser (must be run through the Flask server, not opened as a local file, or the frontend won't load its CSS/JS correctly).

## Usage

1. Paste a YouTube link into the input field.
2. Click **Fetch** to load the video's title, thumbnail, and available qualities.
3. Choose **Video** or **Audio (MP3)** mode.
4. Pick a quality from the dropdown.
5. Click **Download**.

## Notes

- YouTube periodically tightens bot detection, which can cause `Please sign in` errors. If this happens:
  - Make sure `yt-dlp` is up to date: `pip install -U yt-dlp`
  - The backend uses `cookiesfrombrowser` to authenticate using your local browser's session — close the browser first if cookies fail to read (Chrome locks its cookie DB while running; Firefox does not).
- This tool is intended for personal use only. Respect copyright and the terms of service of any site you download from.