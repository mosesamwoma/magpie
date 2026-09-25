(() => {
    'use strict';

    const urlInput = document.getElementById('url');
    const pasteBtn = document.getElementById('paste-btn');
    const clearBtn = document.getElementById('clear-btn');
    const fetchBtn = document.getElementById('fetch');
    const statusEl = document.getElementById('status');
    const modeToggle = document.querySelector('.mode-toggle');
    const modeBtns = document.querySelectorAll('.mode-btn');
    const recentList = document.getElementById('recent-list');

    const resultSection = document.getElementById('result');
    const thumbWrap = document.querySelector('.thumb-wrap');
    const thumbEl = document.getElementById('thumb');
    const durationBadge = document.getElementById('duration');
    const titleEl = document.getElementById('title');
    const uploaderEl = document.getElementById('uploader');
    const playlistNote = document.getElementById('playlist-note');
    const formatSelect = document.getElementById('format-select');
    const formatBadges = document.getElementById('format-badges');
    const downloadBtn = document.getElementById('download');
    const copyTitleBtn = document.getElementById('copy-title-btn');
    const copyThumbBtn = document.getElementById('copy-thumb-btn');

    const formatFilters = document.getElementById('format-filters');
    const mp4OnlyCheckbox = document.getElementById('mp4-only');
    const maxQualitySelect = document.getElementById('max-quality');

    const progressWrap = document.getElementById('progress-wrap');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');
    const progressSize = document.getElementById('progress-size');
    const cancelBtn = document.getElementById('cancel-btn');

    const toastEl = document.getElementById('toast');

    const historyBtn = document.getElementById('history-btn');
    const historyPanel = document.getElementById('history-panel');
    const historyCloseBtn = document.getElementById('history-close-btn');
    const historyList = document.getElementById('history-list');
    const historyEmpty = document.getElementById('history-empty');
    const historyClearBtn = document.getElementById('history-clear-btn');

    const installBtn = document.getElementById('install-btn');
    const configBanner = document.getElementById('config-banner');
    const configBannerText = document.getElementById('config-banner-text');
    const configBannerCloseBtn = document.getElementById('config-banner-close');
    const footerMeta = document.getElementById('footer-meta');

    const STORAGE_KEYS = {
        MODE: 'magpie:mode',
        HISTORY: 'magpie:history',
        MP4_ONLY: 'magpie:mp4-only',
        MAX_QUALITY: 'magpie:max-quality',
        CONFIG_BANNER_DISMISSED: 'magpie:config-banner-dismissed',
    };

    const HISTORY_LIMIT = 20;
    const RECENT_SUGGESTIONS_LIMIT = 6;

    const PROGRESS_STALE_MS = 45000;
    const DEFAULT_TITLE = document.title;

    let mode = 'video';
    let currentInfo = null;
    let toastTimer = null;
    let rateLimitTimer = null;
    let activeJobId = null;
    let isFetchingInfo = false;
    let cancelQueued = false;
    let maxFilesizeBytes = null;
    let deferredInstallPrompt = null;

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

    function readJSONStorage(key, fallback) {
        const raw = readStorage(key);
        if (!raw) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : fallback;
        } catch {
            return fallback;
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
        clearInterval(rateLimitTimer);
        toastEl.textContent = msg;
        toastEl.className = 'toast is-visible' + (type ? ` ${type}` : '');
        toastEl.hidden = false;
        toastTimer = setTimeout(() => {
            toastEl.classList.remove('is-visible');
            setTimeout(() => { toastEl.hidden = true; }, 200);
        }, 3200);
    }

    function showRateLimitToast(retryAfterSeconds) {
        clearTimeout(toastTimer);
        clearInterval(rateLimitTimer);
        let remaining = Math.max(1, Math.ceil(retryAfterSeconds || 1));

        const render = () => {
            toastEl.textContent = `Slow down — try again in ${remaining}s`;
            toastEl.className = 'toast is-visible error';
            toastEl.hidden = false;
        };

        render();
        rateLimitTimer = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(rateLimitTimer);
                toastEl.classList.remove('is-visible');
                setTimeout(() => { toastEl.hidden = true; }, 200);
                return;
            }
            render();
        }, 1000);
    }

    function formatRelativeTime(timestamp) {
        const diffMs = Date.now() - timestamp;
        const minutes = Math.floor(diffMs / 60000);
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
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

    function normalizeUrlInput(str) {
        const trimmed = str.trim();
        if (!trimmed) return trimmed;
        if (isLikelyUrl(trimmed)) return trimmed;
        const withScheme = `https://${trimmed}`;
        return isLikelyUrl(withScheme) ? withScheme : trimmed;
    }

    function isBusy() {
        return isFetchingInfo || activeJobId !== null;
    }

    function syncControls() {
        const busy = isBusy();
        fetchBtn.disabled = busy;
        pasteBtn.disabled = busy;
        clearBtn.disabled = busy;
        modeBtns.forEach((b) => { b.disabled = busy; });

        const hasSelectableFormat = Array.from(formatSelect.options).some((opt) => !opt.disabled);
        downloadBtn.disabled = busy || !currentInfo || !hasSelectableFormat;
        formatSelect.disabled = busy || !hasSelectableFormat;
    }

    function setFetching(value) {
        isFetchingInfo = value;
        fetchBtn.querySelector('.btn-label').textContent = value ? 'Fetching…' : 'Fetch';
        fetchBtn.querySelector('.spinner').hidden = !value;
        syncControls();
    }

    function applyModeToUI() {
        modeBtns.forEach((b) => {
            const isActive = b.dataset.mode === mode;
            b.classList.toggle('is-active', isActive);
            b.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        modeToggle.dataset.active = mode;
        formatFilters.hidden = mode !== 'video';
    }

    (function loadPreferences() {
        const savedMode = readStorage(STORAGE_KEYS.MODE);
        if (savedMode === 'audio' || savedMode === 'video') {
            mode = savedMode;
        }
        applyModeToUI();

        mp4OnlyCheckbox.checked = readStorage(STORAGE_KEYS.MP4_ONLY) === 'true';
        const savedMaxQuality = readStorage(STORAGE_KEYS.MAX_QUALITY);
        if (savedMaxQuality) maxQualitySelect.value = savedMaxQuality;
    })();

    mp4OnlyCheckbox.addEventListener('change', () => {
        writeStorage(STORAGE_KEYS.MP4_ONLY, String(mp4OnlyCheckbox.checked));
        if (currentInfo) populateFormats();
    });

    maxQualitySelect.addEventListener('change', () => {
        writeStorage(STORAGE_KEYS.MAX_QUALITY, maxQualitySelect.value);
        if (currentInfo) populateFormats();
    });

    function readHistory() {
        return readJSONStorage(STORAGE_KEYS.HISTORY, []);
    }

    function addHistoryEntry(entry) {
        const list = readHistory().filter((item) => item.url !== entry.url);
        list.unshift(entry);
        writeStorage(STORAGE_KEYS.HISTORY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
        pushHistoryToServer(entry);
    }

    async function fetchServerHistory() {
        try {
            const res = await fetch('/api/history');
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data.entries) ? data.entries : [];
        } catch {
            return [];
        }
    }

    function pushHistoryToServer(entry) {
        fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry),
        }).catch(() => {});
    }

    function clearServerHistory() {
        fetch('/api/history', { method: 'DELETE' }).catch(() => {});
    }

    function mergeHistoryEntries(localEntries, serverEntries) {
        const byUrl = new Map();
        [...serverEntries, ...localEntries].forEach((entry) => {
            if (!entry || !entry.url) return;
            const existing = byUrl.get(entry.url);
            if (!existing || (entry.timestamp || 0) > (existing.timestamp || 0)) {
                byUrl.set(entry.url, entry);
            }
        });
        return Array.from(byUrl.values())
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, HISTORY_LIMIT);
    }

    async function syncHistoryFromServer() {
        const serverEntries = await fetchServerHistory();
        if (serverEntries.length === 0) return;
        const merged = mergeHistoryEntries(readHistory(), serverEntries);
        writeStorage(STORAGE_KEYS.HISTORY, JSON.stringify(merged));
    }

    function useHistoryEntry(url) {
        urlInput.value = url;
        clearBtn.hidden = false;
        recentList.hidden = true;
        historyPanel.hidden = true;
        if (!isBusy()) fetchInfo();
    }

    function renderRecentList() {
        const entries = readHistory().slice(0, RECENT_SUGGESTIONS_LIMIT);
        recentList.innerHTML = '';
        entries.forEach((entry) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'recent-item';

            if (entry.thumbnail) {
                const img = document.createElement('img');
                img.src = entry.thumbnail;
                img.alt = '';
                btn.appendChild(img);
            }

            const textWrap = document.createElement('span');
            textWrap.className = 'recent-item-text';
            const titleSpan = document.createElement('span');
            titleSpan.className = 'recent-item-title';
            titleSpan.textContent = entry.title || entry.url;
            const urlSpan = document.createElement('span');
            urlSpan.className = 'recent-item-url';
            urlSpan.textContent = entry.url;
            textWrap.appendChild(titleSpan);
            textWrap.appendChild(urlSpan);
            btn.appendChild(textWrap);

            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                useHistoryEntry(entry.url);
            });
            recentList.appendChild(btn);
        });
        return entries.length > 0;
    }

    urlInput.addEventListener('focus', () => {
        if (urlInput.value.length === 0 && renderRecentList()) {
            recentList.hidden = false;
        }
    });

    urlInput.addEventListener('blur', () => {
        setTimeout(() => { recentList.hidden = true; }, 150);
    });

    function renderHistoryPanel() {
        const entries = readHistory();
        historyList.innerHTML = '';
        historyEmpty.hidden = entries.length > 0;
        historyList.hidden = entries.length === 0;

        entries.forEach((entry) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'history-item';

            if (entry.thumbnail) {
                const img = document.createElement('img');
                img.src = entry.thumbnail;
                img.alt = '';
                btn.appendChild(img);
            }

            const textWrap = document.createElement('span');
            textWrap.className = 'history-item-text';
            const titleSpan = document.createElement('span');
            titleSpan.className = 'history-item-title';
            titleSpan.textContent = entry.title || entry.url;
            const metaSpan = document.createElement('span');
            metaSpan.className = 'history-item-meta';
            const modeSpan = document.createElement('span');
            modeSpan.className = 'history-item-mode';
            modeSpan.textContent = entry.mode === 'audio' ? 'MP3' : 'Video';
            const timeSpan = document.createElement('span');
            timeSpan.className = 'history-item-time';
            timeSpan.textContent = formatRelativeTime(entry.timestamp);
            metaSpan.appendChild(modeSpan);
            metaSpan.appendChild(timeSpan);
            textWrap.appendChild(titleSpan);
            textWrap.appendChild(metaSpan);
            btn.appendChild(textWrap);

            btn.addEventListener('click', () => useHistoryEntry(entry.url));
            historyList.appendChild(btn);
        });
    }

    historyBtn.addEventListener('click', () => {
        renderHistoryPanel();
        historyPanel.hidden = false;
    });

    historyCloseBtn.addEventListener('click', () => { historyPanel.hidden = true; });

    historyPanel.addEventListener('click', (e) => {
        if (e.target === historyPanel) historyPanel.hidden = true;
    });

    historyClearBtn.addEventListener('click', () => {
        writeStorage(STORAGE_KEYS.HISTORY, '[]');
        renderHistoryPanel();
        clearServerHistory();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !historyPanel.hidden) {
            historyPanel.hidden = true;
        }
    });

    urlInput.addEventListener('input', () => {
        clearBtn.hidden = urlInput.value.length === 0;
        if (urlInput.value.length > 0) recentList.hidden = true;
    });

    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            fetchInfo();
        } else if (e.key === 'Escape' && urlInput.value && !isBusy()) {
            e.preventDefault();
            resetInput();
        }
    });

    clearBtn.addEventListener('click', () => {
        if (isBusy()) return;
        resetInput();
    });

    function resetInput() {
        urlInput.value = '';
        clearBtn.hidden = true;
        urlInput.focus();
        resultSection.hidden = true;
        currentInfo = null;
        setStatus('');
        syncControls();
    }

    pasteBtn.addEventListener('click', async () => {
        if (!navigator.clipboard?.readText) {
            showToast('Clipboard access isn\'t available — paste manually', 'error');
            return;
        }
        try {
            const text = normalizeUrlInput(await navigator.clipboard.readText());
            if (!text) return;
            urlInput.value = text;
            clearBtn.hidden = false;
            recentList.hidden = true;
            urlInput.focus();
            if (isLikelyUrl(text) && !isBusy()) fetchInfo();
        } catch {
            showToast('Could not read clipboard — paste manually', 'error');
        }
    });

    modeBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.dataset.mode === mode || isBusy()) return;
            mode = btn.dataset.mode;
            applyModeToUI();
            writeStorage(STORAGE_KEYS.MODE, mode);
            if (currentInfo) populateFormats();
        });
    });

    async function fetchInfo() {
        const url = normalizeUrlInput(urlInput.value);
        urlInput.value = url;

        if (!url) {
            setStatus('Paste a link first', 'error');
            urlInput.focus();
            return;
        }
        if (!isLikelyUrl(url)) {
            setStatus('That doesn\'t look like a valid link', 'error');
            return;
        }
        if (isBusy()) {
            showToast(activeJobId ? 'A download is already in progress' : 'Still fetching — one moment', 'error');
            return;
        }

        setFetching(true);
        setStatus('Fetching video info…');
        progressWrap.hidden = true;
        showResultSkeleton();

        try {
            const res = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                if (res.status === 429) {
                    showRateLimitToast(errBody.retry_after);
                    throw new Error('RATE_LIMITED');
                }
                throw new Error(errBody.error || `Server responded with ${res.status}`);
            }

            const data = await res.json();
            currentInfo = data;
            renderInfo(data);
            populateFormats();
            setStatus('');
            resultSection.hidden = false;
        } catch (err) {
            if (err.message === 'RATE_LIMITED') {
                setStatus('Too many requests — slow down a bit', 'error');
                resultSection.hidden = true;
            } else {
                const message = err instanceof TypeError
                    ? 'Could not reach the server — check your connection'
                    : (err.message || 'Could not fetch that link');
                setStatus(message, 'error');
                resultSection.hidden = true;
            }
        } finally {
            thumbWrap.classList.remove('is-loading');
            setFetching(false);
        }
    }

    function showResultSkeleton() {
        resultSection.hidden = false;
        thumbWrap.classList.add('is-loading');
        titleEl.textContent = '';
        uploaderEl.textContent = '';
        playlistNote.hidden = true;
        durationBadge.hidden = true;
        formatBadges.hidden = true;
        formatSelect.innerHTML = '';
    }

    function renderInfo(data) {
        titleEl.textContent = data.title || 'Untitled';
        uploaderEl.textContent = data.uploader || '';
        thumbEl.src = data.thumbnail || '';
        thumbEl.alt = data.title ? `Thumbnail for ${data.title}` : 'Video thumbnail';
        durationBadge.textContent = formatDuration(data.duration);
        durationBadge.hidden = data.duration === undefined || data.duration === null;
        playlistNote.hidden = !data.is_playlist;
    }

    copyTitleBtn.addEventListener('click', async () => {
        if (!currentInfo?.title || !navigator.clipboard?.writeText) return;
        try {
            await navigator.clipboard.writeText(currentInfo.title);
            showToast('Title copied', 'success');
        } catch {
            showToast('Could not copy title', 'error');
        }
    });

    copyThumbBtn.addEventListener('click', async () => {
        if (!currentInfo?.thumbnail) return;
        try {
            if (navigator.clipboard?.write && window.ClipboardItem) {
                const response = await fetch(currentInfo.thumbnail);
                const blob = await response.blob();
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                showToast('Thumbnail copied', 'success');
                return;
            }
            throw new Error('unsupported');
        } catch {
            try {
                await navigator.clipboard.writeText(currentInfo.thumbnail);
                showToast('Thumbnail link copied', 'success');
            } catch {
                showToast('Could not copy thumbnail', 'error');
            }
        }
    });

    function populateFormats() {
        if (!currentInfo) return;

        const all = currentInfo.formats || [];
        let list = all.filter((f) => f.type === mode);

        if (mode === 'video') {
            if (mp4OnlyCheckbox.checked) {
                list = list.filter((f) => f.ext === 'mp4');
            }
            const maxHeight = parseInt(maxQualitySelect.value, 10);
            if (Number.isFinite(maxHeight)) {
                list = list.filter((f) => !f.height || f.height <= maxHeight);
            }
        }

        formatSelect.innerHTML = '';

        if (list.length === 0) {
            const opt = document.createElement('option');
            opt.textContent = all.filter((f) => f.type === mode).length > 0
                ? 'No formats match your filters'
                : (mode === 'audio' ? 'No audio formats available' : 'No video formats available');
            opt.disabled = true;
            opt.selected = true;
            formatSelect.appendChild(opt);
            renderFormatBadges();
            syncControls();
            return;
        }

        list.forEach((fmt) => {
            const opt = document.createElement('option');
            opt.value = fmt.id;
            const sizePart = fmt.filesize ? ` · ${formatBytes(fmt.filesize)}` : '';
            const extPart = fmt.ext ? ` (${fmt.ext})` : '';
            const isOversize = Boolean(maxFilesizeBytes && fmt.filesize && fmt.filesize > maxFilesizeBytes);
            opt.textContent = `${fmt.label}${extPart}${sizePart}${isOversize ? ' · Too large' : ''}`;
            if (isOversize) opt.disabled = true;
            formatSelect.appendChild(opt);
        });

        if (formatSelect.options.length > 0 && formatSelect.options[0].disabled) {
            const firstEnabled = Array.from(formatSelect.options).find((opt) => !opt.disabled);
            if (firstEnabled) formatSelect.value = firstEnabled.value;
        }

        const savedLabel = readStorage(qualityStorageKey(mode));
        if (savedLabel) {
            const match = list.find((fmt) => fmt.label === savedLabel);
            const matchOption = match
                ? Array.from(formatSelect.options).find((opt) => opt.value === match.id)
                : null;
            if (matchOption && !matchOption.disabled) formatSelect.value = match.id;
        }

        renderFormatBadges();
        syncControls();
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
        if (!currentInfo || isBusy()) return;

        const url = urlInput.value.trim();
        const formatId = formatSelect.value;

        if (!formatId) {
            showToast('Pick a quality first', 'error');
            return;
        }

        activeJobId = 'pending';
        cancelQueued = false;
        syncControls();
        progressWrap.hidden = false;
        cancelBtn.hidden = false;
        cancelBtn.disabled = false;
        setProgress(null);
        setStatus('Starting download…');

        try {
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, format_id: formatId, mode }),
            });

            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                if (res.status === 429) {
                    showRateLimitToast(errBody.retry_after);
                    throw new Error('RATE_LIMITED');
                }
                throw new Error(errBody.error || `Server responded with ${res.status}`);
            }

            const { job_id: jobId } = await res.json();
            activeJobId = jobId;
            if (cancelQueued) requestCancel(jobId);
            await trackProgress(jobId);

            setStatus('');
            showToast('Download complete', 'success');
            addHistoryEntry({
                url,
                title: currentInfo.title || url,
                thumbnail: currentInfo.thumbnail || '',
                mode,
                timestamp: Date.now(),
            });
            triggerFileDownload(jobId);
        } catch (err) {
            if (err.message === 'CANCELLED') {
                setStatus('Download cancelled');
                showToast('Download cancelled');
            } else if (err.message === 'RATE_LIMITED') {
                setStatus('Too many requests — slow down a bit', 'error');
            } else {
                const message = err instanceof TypeError
                    ? 'Lost connection to the server'
                    : (err.message || 'Download failed');
                setStatus(message, 'error');
                showToast(message, 'error');
            }
        } finally {
            cancelBtn.hidden = true;
            activeJobId = null;
            cancelQueued = false;
            document.title = DEFAULT_TITLE;
            syncControls();
            setTimeout(() => { progressWrap.hidden = true; }, 900);
        }
    }

    function trackProgress(jobId) {
        return new Promise((resolve, reject) => {
            const source = new EventSource(`/api/progress/${jobId}/stream`);
            let staleTimer = null;

            const clearStaleTimer = () => clearTimeout(staleTimer);
            const resetStaleTimer = () => {
                clearStaleTimer();
                staleTimer = setTimeout(() => {
                    source.close();
                    reject(new Error('Lost connection while downloading'));
                }, PROGRESS_STALE_MS);
            };
            resetStaleTimer();

            source.onmessage = (event) => {
                resetStaleTimer();

                let data;
                try {
                    data = JSON.parse(event.data);
                } catch {
                    return;
                }

                if (data.error) {
                    clearStaleTimer();
                    source.close();
                    reject(new Error(data.error));
                    return;
                }

                renderProgress(data);

                if (data.status === 'finished') {
                    clearStaleTimer();
                    source.close();
                    resolve();
                } else if (data.status === 'cancelled') {
                    clearStaleTimer();
                    source.close();
                    reject(new Error('CANCELLED'));
                } else if (data.status === 'error') {
                    clearStaleTimer();
                    source.close();
                    reject(new Error(data.error || 'Download failed'));
                }
            };

            source.onerror = () => {
                if (source.readyState === EventSource.CLOSED) {
                    clearStaleTimer();
                    reject(new Error('Lost connection while downloading'));
                }
            };
        });
    }

    function requestCancel(jobId) {
        return fetch(`/api/cancel/${jobId}`, { method: 'POST' }).catch(() => {});
    }

    cancelBtn.addEventListener('click', () => {
        if (!activeJobId) return;
        cancelBtn.disabled = true;
        setStatus('Cancelling…');
        if (activeJobId === 'pending') {
            cancelQueued = true;
            return;
        }
        requestCancel(activeJobId);
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
            document.title = `${pct}% · ${DEFAULT_TITLE}`;
        } else if (data.status === 'downloading') {
            setProgress(null);
            progressSize.textContent = downloaded ? formatBytes(downloaded) : '';
            setStatus('Downloading…');
            document.title = DEFAULT_TITLE;
        } else if (data.status === 'processing') {
            setProgress(100);
            progressSize.textContent = '';
            setStatus(mode === 'audio' ? 'Converting to MP3…' : 'Merging video and audio…');
            document.title = `Finishing up · ${DEFAULT_TITLE}`;
        } else if (data.status === 'cancelling') {
            progressSize.textContent = '';
            setStatus('Cancelling…');
        } else if (data.status === 'finished') {
            setProgress(100);
            progressSize.textContent = total ? formatBytes(total) : '';
            document.title = DEFAULT_TITLE;
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

    async function loadHealth() {
        try {
            const res = await fetch('/api/health');
            if (!res.ok) return;
            const data = await res.json();

            if (typeof data.max_filesize_mb === 'number' && data.max_filesize_mb > 0) {
                maxFilesizeBytes = data.max_filesize_mb * 1024 * 1024;
                if (currentInfo) populateFormats();
            }

            if (data.yt_dlp_version) {
                footerMeta.textContent = `yt-dlp v${data.yt_dlp_version} · checked at ${new Date().toLocaleTimeString()}`;
                footerMeta.hidden = false;
            }

            if (Array.isArray(data.warnings) && data.warnings.length > 0) {
                const signature = data.warnings.join('|');
                if (readStorage(STORAGE_KEYS.CONFIG_BANNER_DISMISSED) !== signature) {
                    configBannerText.textContent = data.warnings.join(' ');
                    configBanner.dataset.signature = signature;
                    configBanner.hidden = false;
                }
            }
        } catch {
        }
    }

    configBannerCloseBtn.addEventListener('click', () => {
        writeStorage(STORAGE_KEYS.CONFIG_BANNER_DISMISSED, configBanner.dataset.signature || '');
        configBanner.hidden = true;
    });


    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        installBtn.hidden = false;
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;
        installBtn.disabled = true;
        deferredInstallPrompt.prompt();
        try {
            await deferredInstallPrompt.userChoice;
        } catch {
        }
        deferredInstallPrompt = null;
        installBtn.hidden = true;
        installBtn.disabled = false;
    });

    window.addEventListener('appinstalled', () => {
        installBtn.hidden = true;
        deferredInstallPrompt = null;
        showToast('Magpie installed', 'success');
    });

    fetchBtn.addEventListener('click', fetchInfo);
    downloadBtn.addEventListener('click', startDownload);

    syncControls();
    loadHealth();
    syncHistoryFromServer();
})();
