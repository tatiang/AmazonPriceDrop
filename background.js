// Amazon Price Drop Finder background service worker v1.10
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'OPEN_SETTINGS_POPUP') {
    const url = chrome.runtime.getURL('popup.html?settings=1');
    chrome.windows.create(
      {
        url,
        type: 'popup',
        width: 390,
        height: 520
      },
      () => sendResponse({ ok: true })
    );
    return true;
  }
});
