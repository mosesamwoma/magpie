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

        const all = currentInfo.formats || [];
        const list = all.filter((f) => f.type === mode);

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
            opt.value = fmt.id;
            const sizePart = fmt.filesize ? ` · ${formatBytes(fmt.filesize)}` : '';
            const extPart = fmt.ext ? ` (${fmt.ext})` : '';
            opt.textContent = `${fmt.label}${extPart}${sizePart}`;
            formatSelect.appendChild(opt);
        });
    }

    const POLL_INTERVAL_MS = 700;

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
        setProgress(null);
        setStatus('Starting download…');

        try {
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, format_id: formatId, mode })
            });

            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error || `Server responded with ${res.status}`);
            }

            const { job_id: jobId } = await res.json();
            await pollUntilDone(jobId);

            setStatus('');
            showToast('Download complete', 'success');
            triggerFileDownload(jobId);
        } catch (err) {
            setStatus(err.message || 'Download failed', 'error');
            showToast(err.message || 'Download failed', 'error');
        } finally {
            downloadBtn.disabled = false;
            formatSelect.disabled = false;
            setTimeout(() => { progressWrap.hidden = true; }, 900);
        }
    }

    function pollUntilDone(jobId) {
        return new Promise((resolve, reject) => {
            const tick = async () => {
                let data;
                try {
                    const res = await fetch(`/api/progress/${jobId}`);
                    data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Lost track of that download');
                } catch (err) {
                    reject(err);
                    return;
                }

                if (data.status === 'error') {
                    reject(new Error(data.error || 'Download failed'));
                    return;
                }

                renderProgress(data);

                if (data.status === 'finished') {
                    resolve();
                    return;
                }

                setTimeout(tick, POLL_INTERVAL_MS);
            };
            tick();
        });
    }

    function renderProgress(data) {
        const downloaded = data.downloaded_bytes;
        const total = data.total_bytes;

        if (data.status === 'downloading' && total) {
            const pct = Math.min(100, Math.round((downloaded / total) * 100));
            setProgress(pct);
            const parts = [`${formatBytes(downloaded)} / ${formatBytes(total)}`];
            if (data.speed) parts.push(`${formatBytes(data.speed)}/s`);
            if (Number.isFinite(data.eta)) parts.push(`ETA ${formatDuration(data.eta)}`);
            progressSize.textContent = parts.join(' · ');
            setStatus('Downloading…');
        } else if (data.status === 'downloading') {
            setProgress(null);
            progressSize.textContent = downloaded ? formatBytes(downloaded) : '';
            setStatus('Downloading…');
        } else if (data.status === 'processing') {
            setProgress(100);
            progressSize.textContent = '';
            setStatus(mode === 'audio' ? 'Converting to MP3…' : 'Merging video and audio…');
        } else if (data.status === 'finished') {
            setProgress(100);
            progressSize.textContent = '';
        } else {
            setProgress(null);
            setStatus('Starting download…');
        }
    }

    function setProgress(pct) {
        const indeterminate = pct === null;
        progressWrap.classList.toggle('is-indeterminate', indeterminate);
        if (indeterminate) {
            progressBar.style.removeProperty('width');
            progressPercent.textContent = '';
        } else {
            progressBar.style.width = `${pct}%`;
            progressPercent.textContent = `${pct}%`;
        }
    }

    function triggerFileDownload(jobId) {
        const a = document.createElement('a');
        a.href = `/api/file/${jobId}`;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
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