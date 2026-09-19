# Magpie

A self-hosted YouTube downloader. Paste a link, pick a quality, and get the video — or strip it down to just the audio as an MP3.

## Features

- Fetch a video's title, thumbnail, uploader, and duration before downloading anything
- Download the full video at any available quality
- Extract audio only, converted to a real MP3
- Single-page frontend, no build step, no frontend framework
- Automatic cleanup of old downloads after a configurable time
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
| `CLEANUP_AFTER_MINUTES`   | `30`       | Auto-delete files older than this                                                                  |
| `FLASK_PORT`              | `5000`     | Port the app runs on                                                                                |
| `FLASK_DEBUG`             | `False`    | Flask debug mode — leave off in production                                                          |
| `COOKIES_FILE`            | *(empty)*  | Path to a `cookies.txt` file — portable across OS and browser, recommended if you need cookies at all |
| `COOKIES_FROM_BROWSER`    | *(empty)*  | `auto` to try every installed browser automatically, or a specific one (`chrome`, `firefox`, etc.) — ignored if `COOKIES_FILE` is set |

## Running

```bash
cd backend
python run.py
```

Visit `http://127.0.0.1:5000` in your browser. The app must be run through the Flask server, not opened as a local file, or the frontend won't load its CSS/JS correctly.

## Usage

1. Paste a YouTube link into the input field.
2. Click **Fetch** to load the video's title, thumbnail, and available qualities.
3. Choose **Video** or **Audio (MP3)** mode.
4. Pick a quality from the dropdown.
5. Click **Download**.

## Authentication

YouTube periodically tightens bot detection, which can surface as a `Please sign in` error. If that happens, there are two ways to authenticate — pick one:

- **`COOKIES_FILE`** (recommended): export a `cookies.txt` from any browser using an extension like "Get cookies.txt LOCALLY", then point `COOKIES_FILE` at it in `.env`. Works no matter which browser you used to export it or where the app itself runs — it's the only option that works if the app isn't on your own desktop.
- **`COOKIES_FROM_BROWSER`**: set it to `auto` to automatically try every major browser (Chrome, Edge, Brave, Chromium, Firefox, Vivaldi, Opera, Safari) installed on the machine the app runs on, and use whichever one actually has a working session — or set it to one specific browser name to only try that one. This reads a live browser profile on the same machine the app runs on, so close the browser first if cookies fail to read (Chrome locks its cookie database while running; Firefox does not).

If cookies still fail, make sure yt-dlp itself is up to date:

```bash
pip install -U yt-dlp
```

## Notes

This tool is intended for personal use only. Respect copyright and the terms of service of any site you download from.
