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
    const formatBadges = document.getElementById('format-badges');
    const downloadBtn = document.getElementById('download');

    const progressWrap = document.getElementById('progress-wrap');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');
    const progressSize = document.getElementById('progress-size');
    const cancelBtn = document.getElementById('cancel-btn');

    const toastEl = document.getElementById('toast');

    const STORAGE_KEYS = { MODE: 'magpie:mode' };

    let mode = 'video';
    let currentInfo = null;
    let toastTimer = null;
    let activeJobId = null;

    function readStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch {
        }
    }

    function qualityStorageKey(m) {
        return `magpie:quality:${m}`;
    }

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

    function applyModeToUI() {
        modeBtns.forEach((b) => {
            const isActive = b.dataset.mode === mode;
            b.classList.toggle('is-active', isActive);
            b.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        modeToggle.dataset.active = mode;
    }

    (function loadPreferences() {
        const savedMode = readStorage(STORAGE_KEYS.MODE);
        if (savedMode === 'audio' || savedMode === 'video') {
            mode = savedMode;
        }
        applyModeToUI();
    })();

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
            applyModeToUI();
            writeStorage(STORAGE_KEYS.MODE, mode);
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
            renderFormatBadges();
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

        const savedLabel = readStorage(qualityStorageKey(mode));
        if (savedLabel) {
            const match = list.find((fmt) => fmt.label === savedLabel);
            if (match) formatSelect.value = match.id;
        }

        renderFormatBadges();
    }

    function renderFormatBadges() {
        formatBadges.innerHTML = '';

        const fmt = (currentInfo?.formats || []).find((f) => f.id === formatSelect.value);
        if (!fmt) {
            formatBadges.hidden = true;
            return;
        }

        const items = [];
        if (fmt.ext) items.push({ text: fmt.ext.toUpperCase(), cls: 'badge-ext' });
        if (fmt.codec) items.push({ text: fmt.codec, cls: 'badge-codec' });
        if (fmt.filesize) items.push({ text: formatBytes(fmt.filesize), cls: '' });

        items.forEach(({ text, cls }) => {
            const span = document.createElement('span');
            span.className = `badge ${cls}`.trim();
            span.textContent = text;
            formatBadges.appendChild(span);
        });

        formatBadges.hidden = items.length === 0;
    }

    formatSelect.addEventListener('change', () => {
        const fmt = (currentInfo?.formats || []).find((f) => f.id === formatSelect.value);
        if (fmt) writeStorage(qualityStorageKey(mode), fmt.label);
        renderFormatBadges();
    });

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
        cancelBtn.hidden = false;
        cancelBtn.disabled = false;
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
            activeJobId = jobId;
            await trackProgress(jobId);

            setStatus('');
            showToast('Download complete', 'success');
            triggerFileDownload(jobId);
        } catch (err) {
            if (err.message === 'CANCELLED') {
                setStatus('Download cancelled');
                showToast('Download cancelled');
            } else {
                setStatus(err.message || 'Download failed', 'error');
                showToast(err.message || 'Download failed', 'error');
            }
        } finally {
            downloadBtn.disabled = false;
            formatSelect.disabled = false;
            cancelBtn.hidden = true;
            activeJobId = null;
            setTimeout(() => { progressWrap.hidden = true; }, 900);
        }
    }

    function trackProgress(jobId) {
        return new Promise((resolve, reject) => {
            const source = new EventSource(`/api/progress/${jobId}/stream`);

            source.onmessage = (event) => {
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch {
                    return;
                }

                if (data.error) {
                    source.close();
                    reject(new Error(data.error));
                    return;
                }

                renderProgress(data);

                if (data.status === 'finished') {
                    source.close();
                    resolve();
                } else if (data.status === 'cancelled') {
                    source.close();
                    reject(new Error('CANCELLED'));
                } else if (data.status === 'error') {
                    source.close();
                    reject(new Error(data.error || 'Download failed'));
                }
            };

            source.onerror = () => {
                source.close();
                reject(new Error('Lost connection while downloading'));
            };
        });
    }

    cancelBtn.addEventListener('click', async () => {
        if (!activeJobId) return;
        cancelBtn.disabled = true;
        setStatus('Cancelling…');
        try {
            await fetch(`/api/cancel/${activeJobId}`, { method: 'POST' });
        } catch {
        }
    });

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
        } else if (data.status === 'cancelling') {
            progressSize.textContent = '';
            setStatus('Cancelling…');
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
