// Amazon Price Drop Finder popup v1.09
const DEFAULTS = { threshold: 10, autoHighlight: true };

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0]));
  });
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function storageSet(obj) {
  return new Promise((resolve) => chrome.storage.sync.set(obj, resolve));
}

function isAmazonCartUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const hostOk = /(^|\.)amazon\.com$/.test(u.hostname);
    const path = u.pathname || '';
    // Common cart pages:
    const pathOk = path.includes('/gp/cart/view') || path.includes('/cart/');
    return hostOk && pathOk;
  } catch {
    return false;
  }
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) reject(err);
      else resolve(resp);
    });
  });
}

async function ensureContentScript(tabId) {
  // Inject content.js if the page didn't already have it (e.g., after an update, or site access toggles).
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });
}

function setVersion() {
  const v = chrome.runtime.getManifest().version;
  const el = document.getElementById('version');
  if (el) el.textContent = `v${v}`;
}

async function init() {
  setVersion();

  const statusEl = document.getElementById('status');
  const scanBtn = document.getElementById('scan');
  const clearBtn = document.getElementById('clear');
  const thresholdEl = document.getElementById('threshold');

  // If opened from the in-page panel gear, focus settings
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('settings') === '1') {
      // Focus the threshold field so it's immediately editable
      setTimeout(() => {
        const t = document.getElementById('threshold');
        if (t) t.focus();
      }, 50);
    }
  } catch {}

  const autoEl = document.getElementById('auto');
const { threshold, autoHighlight } = { ...DEFAULTS, ...(await storageGet(DEFAULTS)) };
  thresholdEl.value = threshold;
  autoEl.checked = autoHighlight;

  thresholdEl.addEventListener('change', async () => {
    const v = Math.max(1, Math.min(99, Number(thresholdEl.value || DEFAULTS.threshold)));
    thresholdEl.value = v;
    await storageSet({ threshold: v });
  });

  autoEl.addEventListener('change', async () => {
    await storageSet({ autoHighlight: autoEl.checked });
  });

  async function doScan() {
    const tab = await getActiveTab();
    if (!tab?.id) return;

    if (!isAmazonCartUrl(tab.url)) {
      statusEl.textContent = "Not an Amazon cart page.";
      statusEl.className = "status";
      return;
    }

    statusEl.textContent = "Scanning…";
    statusEl.className = "status working";
    scanBtn.disabled = true;

    try {
      // Try normal messaging first
      let resp = await sendMessageToTab(tab.id, { type: 'APDF_SCAN' });

      // If no response (rare), still show completion
      if (resp?.ok) {
        statusEl.textContent = `Scan complete — ${resp.qualifying} item(s) ≥${resp.threshold}% (scanned ${resp.scanned})`;
        statusEl.className = "status done";
      } else {
        statusEl.textContent = "Scan complete (no response).";
        statusEl.className = "status done";
      }
    } catch (err) {
      // Typical error: "Could not establish connection. Receiving end does not exist."
      const msg = String(err?.message || err);
      if (msg.includes("Receiving end does not exist")) {
        try {
          await ensureContentScript(tab.id);
          const resp2 = await sendMessageToTab(tab.id, { type: 'APDF_SCAN' });
          if (resp2?.ok) {
            statusEl.textContent = `Scan complete — ${resp2.qualifying} item(s) ≥${resp2.threshold}% (scanned ${resp2.scanned})`;
            statusEl.className = "status done";
            return;
          }
        } catch (err2) {
          // fall through
        }
        statusEl.textContent = "Couldn’t scan. Make sure site access is allowed for amazon.com.";
        statusEl.className = "status";
        return;
      }

      statusEl.textContent = "Couldn’t scan. Check site access for amazon.com.";
      statusEl.className = "status";
    } finally {
      scanBtn.disabled = false;
    }
  }

  async function doClear() {
    const tab = await getActiveTab();
    if (!tab?.id) return;

    statusEl.textContent = "Clearing highlights…";
    statusEl.className = "status working";
    clearBtn.disabled = true;

    try {
      await sendMessageToTab(tab.id, { type: 'APDF_CLEAR' });
      statusEl.textContent = "Idle";
      statusEl.className = "status";
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.includes("Receiving end does not exist")) {
        try {
          await ensureContentScript(tab.id);
          await sendMessageToTab(tab.id, { type: 'APDF_CLEAR' });
          statusEl.textContent = "Idle";
          statusEl.className = "status";
          return;
        } catch {}
      }
      statusEl.textContent = "Couldn’t clear. Make sure you’re on an Amazon cart page.";
      statusEl.className = "status";
    } finally {
      clearBtn.disabled = false;
    }
  }

  scanBtn.addEventListener('click', doScan);
  clearBtn.addEventListener('click', doClear);
}

init();
