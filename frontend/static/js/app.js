(() => {
    'use strict';

    const urlInput = document.getElementById('url');
    const pasteBtn = document.getElementById('paste-btn');
    const clearBtn = document.getElementById('clear-btn');
    const fetchBtn = document.getElementById('fetch');
    const statusEl = document.getElementById('status');
    const modeToggle = document.querySelector('.mode-toggle');
    const modeBtns = document.querySelectorAll('.mode-btn');

    const resultSection = document.getElementById('result');
    const thumbEl = document.getElementById('thumb');
    const durationBadge = document.getElementById('duration');
    const titleEl = document.getElementById('title');
    const uploaderEl = document.getElementById('uploader');
    const formatSelect = document.getElementById('format-select');
    const downloadBtn = document.getElementById('download');

    const progressWrap = document.getElementById('progress-wrap');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');
    const progressSize = document.getElementById('progress-size');

    const toastEl = document.getElementById('toast');

    let mode = 'video';
    let currentInfo = null;
    let toastTimer = null;

    function setStatus(msg, type) {
        statusEl.textContent = msg || '';
        statusEl.className = 'status' + (type ? ` ${type}` : '');
    }

    function showToast(msg, type) {
        clearTimeout(toastTimer);
        toastEl.textContent = msg;
        toastEl.className = 'toast is-visible' + (type ? ` ${type}` : '');
        toastEl.hidden = false;
        toastTimer = setTimeout(() => {
            toastEl.classList.remove('is-visible');
            setTimeout(() => { toastEl.hidden = true; }, 200);
        }, 3200);
    }

    function formatDuration(totalSeconds) {
        if (!totalSeconds && totalSeconds !== 0) return '';
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = Math.floor(totalSeconds % 60);
        const pad = (n) => String(n).padStart(2, '0');
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    }

    function formatBytes(bytes) {
        if (!bytes && bytes !== 0) return '';
        const units = ['B', 'KB', 'MB', 'GB'];
        let val = bytes;
        let i = 0;
        while (val >= 1024 && i < units.length - 1) {
            val /= 1024;
            i++;
        }
        return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
    }

    function isLikelyUrl(str) {
        try {
            const u = new URL(str.trim());
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
            return false;
        }
    }

    function setBusy(isBusy) {
        fetchBtn.disabled = isBusy;
        fetchBtn.querySelector('.btn-label').textContent = isBusy ? 'Fetching…' : 'Fetch';
        fetchBtn.querySelector('.spinner').hidden = !isBusy;
    }

    urlInput.addEventListener('input', () => {
        clearBtn.hidden = urlInput.value.length === 0;
    });

    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        clearBtn.hidden = true;
        urlInput.focus();
        resultSection.hidden = true;
        setStatus('');
    });

    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                clearBtn.hidden = false;
                urlInput.focus();
            }
        } catch {
            showToast('Could not read clipboard — paste manually', 'error');
        }
    });

    modeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.dataset.mode === mode) return;
            mode = btn.dataset.mode;
            modeBtns.forEach((b) => {
                b.classList.toggle('is-active', b === btn);
                b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
            });
            modeToggle.dataset.active = mode;
            if (currentInfo) populateFormats();
        });
    });

    async function fetchInfo() {
        const url = urlInput.value.trim();

        if (!url) {
            setStatus('Paste a link first', 'error');
            return;
        }
        if (!isLikelyUrl(url)) {
            setStatus('That doesn\'t look like a valid link', 'error');
            return;
        }

        setBusy(true);
        setStatus('Fetching video info…');
        resultSection.hidden = true;
        progressWrap.hidden = true;

        try {
            const res = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error || `Server responded with ${res.status}`);
            }

            const data = await res.json();
            currentInfo = data;
            renderInfo(data);
            populateFormats();
            setStatus('');
            resultSection.hidden = false;
        } catch (err) {
            setStatus(err.message || 'Could not fetch that link', 'error');
        } finally {
            setBusy(false);
        }
    }

    function renderInfo(data) {
        titleEl.textContent = data.title || 'Untitled';
        uploaderEl.textContent = data.uploader || '';
        thumbEl.src = data.thumbnail || '';
        thumbEl.alt = data.title || 'Thumbnail';
        durationBadge.textContent = formatDuration(data.duration);
        durationBadge.hidden = data.duration === undefined || data.duration === null;
    }

    function populateFormats() {
        if (!currentInfo) return;

        const list = mode === 'audio'
            ? (currentInfo.audio_formats || [])
            : (currentInfo.video_formats || []);

        formatSelect.innerHTML = '';

        if (list.length === 0) {
            const opt = document.createElement('option');
            opt.textContent = mode === 'audio' ? 'No audio formats available' : 'No video formats available';
            opt.disabled = true;
            opt.selected = true;
            formatSelect.appendChild(opt);
            downloadBtn.disabled = true;
            return;
        }

        downloadBtn.disabled = false;

        list.forEach((fmt) => {
            const opt = document.createElement('option');
            opt.value = fmt.format_id;
            const sizePart = fmt.filesize ? ` · ${formatBytes(fmt.filesize)}` : '';
            const extPart = fmt.ext ? ` (${fmt.ext})` : '';
            opt.textContent = `${fmt.label}${extPart}${sizePart}`;
            formatSelect.appendChild(opt);
        });
    }

    async function startDownload() {
        if (!currentInfo) return;

        const url = urlInput.value.trim();
        const formatId = formatSelect.value;

        if (!formatId) {
            showToast('Pick a quality first', 'error');
            return;
        }

        downloadBtn.disabled = true;
        formatSelect.disabled = true;
        progressWrap.hidden = false;
        progressBar.style.width = '0%';
        progressPercent.textContent = '0%';
        progressSize.textContent = '';
        setStatus('Preparing download…');

        try {
            const params = new URLSearchParams({ url, format_id: formatId, mode });
            const res = await fetch(`/api/download?${params.toString()}`);

            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error || `Server responded with ${res.status}`);
            }

            const totalBytes = Number(res.headers.get('Content-Length')) || 0;
            const disposition = res.headers.get('Content-Disposition') || '';
            const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
            const filename = filenameMatch
                ? decodeURIComponent(filenameMatch[1])
                : `${(currentInfo.title || 'download').replace(/[\\/:*?"<>|]/g, '')}.${mode === 'audio' ? 'mp3' : 'mp4'}`;

            if (!res.body) {
                const blob = await res.blob();
                triggerSave(blob, filename);
            } else {
                const reader = res.body.getReader();
                const chunks = [];
                let received = 0;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    received += value.length;

                    if (totalBytes) {
                        const pct = Math.min(100, Math.round((received / totalBytes) * 100));
                        progressBar.style.width = `${pct}%`;
                        progressPercent.textContent = `${pct}%`;
                        progressSize.textContent = `${formatBytes(received)} / ${formatBytes(totalBytes)}`;
                    } else {
                        progressPercent.textContent = formatBytes(received);
                        progressSize.textContent = '';
                    }
                }

                const blob = new Blob(chunks);
                progressBar.style.width = '100%';
                progressPercent.textContent = '100%';
                triggerSave(blob, filename);
            }

            setStatus('');
            showToast('Download complete', 'success');
        } catch (err) {
            setStatus(err.message || 'Download failed', 'error');
            showToast(err.message || 'Download failed', 'error');
        } finally {
            downloadBtn.disabled = false;
            formatSelect.disabled = false;
            setTimeout(() => { progressWrap.hidden = true; }, 800);
        }
    }

    function triggerSave(blob, filename) {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }

    fetchBtn.addEventListener('click', fetchInfo);
    downloadBtn.addEventListener('click', startDownload);

    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            fetchInfo();
        }
    });
})();
