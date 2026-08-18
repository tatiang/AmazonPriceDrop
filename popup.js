// Amazon Price Drop Finder popup v1.10
const DEFAULTS = {
  threshold: 10,
  minDollarDrop: 0,
  autoHighlight: true
};

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0]));
  });
}

function storageGet(defaults) {
  return new Promise((resolve) => chrome.storage.sync.get(defaults, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.sync.set(values, resolve));
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve(response);
    });
  });
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

function isAmazonCartUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const hostOk = /(^|\.)amazon\.com$/i.test(u.hostname);
    const path = u.pathname || '';
    return hostOk && (
      path.includes('/gp/cart/view') ||
      path.includes('/gp/cart/') ||
      path.includes('/cart/')
    );
  } catch {
    return false;
  }
}

function normalizeSettings(raw) {
  const threshold = Math.max(0, Math.min(99, Number(raw.threshold ?? DEFAULTS.threshold)));
  const minDollarDrop = Math.max(0, Number(raw.minDollarDrop ?? DEFAULTS.minDollarDrop));
  return {
    threshold: Number.isFinite(threshold) ? threshold : DEFAULTS.threshold,
    minDollarDrop: Number.isFinite(minDollarDrop) ? minDollarDrop : DEFAULTS.minDollarDrop,
    autoHighlight: Boolean(raw.autoHighlight)
  };
}

async function saveSettingsFromUI() {
  const thresholdEl = document.getElementById('threshold');
  const minDollarEl = document.getElementById('minDollarDrop');
  const autoEl = document.getElementById('auto');

  const settings = normalizeSettings({
    threshold: thresholdEl.value,
    minDollarDrop: minDollarEl.value,
    autoHighlight: autoEl.checked
  });

  thresholdEl.value = settings.threshold;
  minDollarEl.value = settings.minDollarDrop.toFixed(2);
  await storageSet(settings);
  return settings;
}

async function sendWithRetry(tabId, message) {
  try {
    return await sendMessageToTab(tabId, message);
  } catch (err) {
    const text = String(err?.message || err);
    if (!text.includes('Receiving end does not exist')) throw err;
    await ensureContentScript(tabId);
    return await sendMessageToTab(tabId, message);
  }
}

function setVersion() {
  const el = document.getElementById('version');
  if (el) el.textContent = `v${chrome.runtime.getManifest().version}`;
}

async function init() {
  setVersion();

  const thresholdEl = document.getElementById('threshold');
  const minDollarEl = document.getElementById('minDollarDrop');
  const autoEl = document.getElementById('auto');
  const scanBtn = document.getElementById('scan');
  const clearBtn = document.getElementById('clear');
  const statusEl = document.getElementById('status');

  const saved = normalizeSettings({ ...DEFAULTS, ...(await storageGet(DEFAULTS)) });
  thresholdEl.value = saved.threshold;
  minDollarEl.value = saved.minDollarDrop.toFixed(2);
  autoEl.checked = saved.autoHighlight;

  for (const el of [thresholdEl, minDollarEl, autoEl]) {
    el.addEventListener('change', saveSettingsFromUI);
  }

  const params = new URLSearchParams(location.search);
  if (params.get('settings') === '1') {
    setTimeout(() => thresholdEl.focus(), 50);
  }

  scanBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab?.id || !isAmazonCartUrl(tab.url)) {
      statusEl.textContent = 'Open an Amazon cart page to scan.';
      statusEl.className = 'status error';
      return;
    }

    const settings = await saveSettingsFromUI();
    statusEl.textContent = 'Scanning…';
    statusEl.className = 'status working';
    scanBtn.disabled = true;

    try {
      const resp = await sendWithRetry(tab.id, { type: 'APDF_SCAN' });
      if (!resp?.ok) throw new Error(resp?.error || 'No response from page.');
      statusEl.textContent =
        `Found ${resp.qualifying} item(s): ≥${settings.threshold}% AND ≥$${settings.minDollarDrop.toFixed(2)}.`;
      statusEl.className = 'status done';
    } catch {
      statusEl.textContent = 'Couldn’t scan. Check Amazon site access and refresh the cart page.';
      statusEl.className = 'status error';
    } finally {
      scanBtn.disabled = false;
    }
  });

  clearBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab?.id || !isAmazonCartUrl(tab.url)) {
      statusEl.textContent = 'Open an Amazon cart page first.';
      statusEl.className = 'status error';
      return;
    }

    clearBtn.disabled = true;
    try {
      await sendWithRetry(tab.id, { type: 'APDF_CLEAR' });
      statusEl.textContent = 'Highlights cleared.';
      statusEl.className = 'status';
    } catch {
      statusEl.textContent = 'Couldn’t clear highlights.';
      statusEl.className = 'status error';
    } finally {
      clearBtn.disabled = false;
    }
  });
}

init();
