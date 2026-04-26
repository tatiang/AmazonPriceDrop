// Amazon Price Drop Finder background (service worker) v1.09
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'OPEN_SETTINGS_POPUP') {
    const url = chrome.runtime.getURL('popup.html?settings=1');
    // Open a small popup window (not the toolbar popup) so users can access settings
    chrome.windows.create(
      { url, type: 'popup', width: 380, height: 560 },
      () => sendResponse({ ok: true })
    );
    return true; // keep sendResponse alive
  }
});
