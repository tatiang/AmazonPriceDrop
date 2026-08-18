// Amazon Price Drop Finder extension v1.10
(() => {
  // One content-script instance per document/page load.
  if (window.__APDF_V110_LOADED__) return;
  window.__APDF_V110_LOADED__ = true;

  const DEFAULTS = {
    threshold: 10,
    minDollarDrop: 0,
    autoHighlight: true
  };

  const PANEL_ID = 'apdf-panel';
  let panelHasAppearedThisPage = false;
  let rescanTimer = null;

  const DROP_REGEX =
    /(.*?)\s+has\s+decreased\s+from\s+\$?\s*([\d,.]+)\s+to\s+\$?\s*([\d,.]+)/i;

  function storageGet(defaults) {
    return new Promise((resolve) => chrome.storage.sync.get(defaults, resolve));
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

  function moneyToNumber(value) {
    const n = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function fmtMoney(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  }

  function computeDropFromText(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();

    // Hard guard: increases never enter the candidate set.
    if (!/\bhas\s+decreased\s+from\b/i.test(normalized)) return null;
    if (/\bhas\s+increased\s+from\b/i.test(normalized)) return null;

    const match = normalized.match(DROP_REGEX);
    if (!match) return null;

    const oldPrice = moneyToNumber(match[2]);
    const newPrice = moneyToNumber(match[3]);
    if (oldPrice === null || newPrice === null || oldPrice <= 0) return null;
    if (newPrice >= oldPrice) return null;

    const dollarDrop = oldPrice - newPrice;
    const pct = (dollarDrop / oldPrice) * 100;

    return {
      name: (match[1] || 'Unknown item').trim(),
      oldPrice,
      newPrice,
      dollarDrop,
      pct
    };
  }

  function extractAsinFromUrl(url) {
    const match = String(url || '').match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    return match ? match[1].toUpperCase() : null;
  }

  function findImportantMessageLines() {
    // Prefer exact list items. Do not style their parent container.
    const listItems = Array.from(document.querySelectorAll('li'));
    const results = [];

    for (const li of listItems) {
      const drop = computeDropFromText(li.textContent || '');
      if (!drop) continue;

      const productLink = li.querySelector('a[href*="/dp/"], a[href*="/gp/product/"], a');
      const asin = extractAsinFromUrl(productLink?.getAttribute('href'));

      results.push({
        ...drop,
        element: li,
        productLink,
        asin
      });
    }

    return dedupeResults(results);
  }

  function findFallbackLines() {
    // Only use relatively small elements so we never highlight a large container
    // containing a mix of increases and decreases.
    const candidates = Array.from(document.querySelectorAll('p, span, div'))
      .filter((el) => (el.textContent || '').length < 1200);

    const results = [];
    for (const el of candidates) {
      const drop = computeDropFromText(el.textContent || '');
      if (!drop) continue;

      // Skip any candidate whose child already contains a price-decrease sentence.
      const childMatch = Array.from(el.children).some((child) =>
        computeDropFromText(child.textContent || '')
      );
      if (childMatch) continue;

      const productLink = el.querySelector('a[href*="/dp/"], a[href*="/gp/product/"], a');
      results.push({
        ...drop,
        element: el,
        productLink,
        asin: extractAsinFromUrl(productLink?.getAttribute('href'))
      });
    }

    return dedupeResults(results);
  }

  function dedupeResults(results) {
    const seen = new Set();
    return results.filter((item) => {
      const key = `${item.name}|${item.oldPrice}|${item.newPrice}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function qualifies(item, settings) {
    return (
      item.newPrice < item.oldPrice &&
      item.pct >= settings.threshold &&
      item.dollarDrop >= settings.minDollarDrop
    );
  }

  function findMoveToCartButton(root) {
    if (!root) return null;

    const direct = root.querySelector(
      [
        'input[value*="Move to Cart" i]',
        'input[value*="Add to Cart" i]',
        'button[aria-label*="Move to Cart" i]',
        'button[aria-label*="Add to Cart" i]',
        'input[name*="move-to-cart" i]',
        'input[name*="moveToCart" i]',
        'button[name*="move-to-cart" i]',
        'button[data-action*="move-to-cart" i]'
      ].join(',')
    );
    if (direct) return direct;

    return Array.from(root.querySelectorAll('button, input[type="submit"], a'))
      .find((el) =>
        /^(move to cart|add to cart)$/i.test((el.textContent || el.value || '').trim())
      ) || null;
  }

  function findSavedItemRowByAsin(asin) {
    if (!asin) return null;

    const links = Array.from(
      document.querySelectorAll(
        `a[href*="/dp/${asin}"], a[href*="/gp/product/${asin}"]`
      )
    );

    for (const link of links) {
      const row =
        link.closest('.sc-list-item') ||
        link.closest('[data-itemid]') ||
        link.closest('[data-asin]') ||
        link.closest('.sc-item');

      if (!row) continue;
      if (findMoveToCartButton(row)) return row;
    }

    return null;
  }

  function clearHighlightClasses() {
    document.querySelectorAll('.apdf-match').forEach((el) =>
      el.classList.remove('apdf-match')
    );
    document.querySelectorAll('.apdf-highlight-link').forEach((el) =>
      el.classList.remove('apdf-highlight-link')
    );
  }

  function clearHighlights({ removePanel = true } = {}) {
    clearHighlightClasses();
    if (removePanel) document.getElementById(PANEL_ID)?.remove();
  }

  function decorateQualifyingItems(items) {
    clearHighlightClasses();

    for (const item of items) {
      // Exact price-change line only.
      item.element?.classList.add('apdf-match');
      item.productLink?.classList.add('apdf-highlight-link');

      // Find Saved-for-later row only for the Add-to-cart action.
      // Do not broadly color the cart row.
      item.savedRow = findSavedItemRowByAsin(item.asin);
    }
  }

  function openSettingsWindow() {
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS_POPUP' });
    } catch {}
  }

  function createPanelShell(settings) {
    const panel = document.createElement('aside');
    panel.id = PANEL_ID;

    const header = document.createElement('header');

    const logo = document.createElement('img');
    logo.className = 'apdf-logo';
    logo.src = chrome.runtime.getURL('icons/icon48.png');
    logo.alt = '';

    const heading = document.createElement('div');
    heading.className = 'apdf-heading';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'Price drops';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent =
      `≥${settings.threshold}% AND ≥${fmtMoney(settings.minDollarDrop)}`;

    heading.append(title, meta);

    const headerActions = document.createElement('div');
    headerActions.className = 'header-actions';

    const gear = document.createElement('button');
    gear.className = 'icon-button';
    gear.type = 'button';
    gear.title = 'Settings';
    gear.setAttribute('aria-label', 'Settings');
    gear.textContent = '⚙';
    gear.addEventListener('click', (event) => {
      event.stopPropagation();
      openSettingsWindow();
    });

    const close = document.createElement('button');
    close.className = 'icon-button';
    close.type = 'button';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', () => panel.remove());

    headerActions.append(gear, close);
    header.append(logo, heading, headerActions);

    const content = document.createElement('div');
    content.className = 'content';

    panel.append(header, content);
    document.documentElement.appendChild(panel);

    return panel;
  }

  function updatePanel(items, settings, { allowCreate }) {
    let panel = document.getElementById(PANEL_ID);

    // The panel can be created once per document load. Mutation rescans may update an
    // existing panel. If the user closes it, it remains closed until the page refreshes.
    if (!panel && (!allowCreate || panelHasAppearedThisPage)) return;

    if (!panel) {
      panel = createPanelShell(settings);
      panelHasAppearedThisPage = true;
    }

    const meta = panel.querySelector('.meta');
    if (meta) {
      meta.textContent =
        `${items.length} found · ≥${settings.threshold}% AND ≥${fmtMoney(settings.minDollarDrop)}`;
    }

    const content = panel.querySelector('.content');
    if (!content) return;
    content.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No price decreases meet both thresholds.';
      content.appendChild(empty);
      return;
    }

    const sorted = [...items].sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct;
      return b.dollarDrop - a.dollarDrop;
    });

    for (const item of sorted) {
      const card = document.createElement('div');
      card.className = 'item';

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = item.name;

      const line = document.createElement('div');
      line.className = 'line';

      const prices = document.createElement('span');
      prices.textContent = `${fmtMoney(item.oldPrice)} → ${fmtMoney(item.newPrice)}`;

      const savings = document.createElement('span');
      savings.className = 'savings';
      savings.textContent = `−${item.pct.toFixed(1)}% · −${fmtMoney(item.dollarDrop)}`;

      line.append(prices, savings);
      card.append(name, line);

      const moveButton = findMoveToCartButton(item.savedRow);
      if (moveButton) {
        const actions = document.createElement('div');
        actions.className = 'actions';

        const add = document.createElement('button');
        add.className = 'apdf-add';
        add.type = 'button';
        add.textContent = 'Add to cart';
        add.addEventListener('click', (event) => {
          event.stopPropagation();
          moveButton.click();
          add.disabled = true;
          add.textContent = 'Adding…';
        });

        actions.appendChild(add);
        card.appendChild(actions);
      }

      card.addEventListener('click', () => {
        item.element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      content.appendChild(card);
    }
  }

  async function runScan({ allowPanelCreate = true } = {}) {
    const settings = normalizeSettings({
      ...DEFAULTS,
      ...(await storageGet(DEFAULTS))
    });

    let candidates = findImportantMessageLines();
    if (!candidates.length) candidates = findFallbackLines();

    // AND rule: both thresholds must be met. Increases can never qualify.
    const qualifying = candidates.filter((item) => qualifies(item, settings));

    decorateQualifyingItems(qualifying);
    updatePanel(qualifying, settings, { allowCreate: allowPanelCreate });

    return {
      scanned: candidates.length,
      qualifying: qualifying.length,
      threshold: settings.threshold,
      minDollarDrop: settings.minDollarDrop
    };
  }

  async function init() {
    const settings = normalizeSettings({
      ...DEFAULTS,
      ...(await storageGet(DEFAULTS))
    });

    if (settings.autoHighlight) {
      await runScan({ allowPanelCreate: true });
    }

    // Amazon updates the cart DOM dynamically. Rescan highlights, but never recreate
    // a panel the user already closed during this page load.
    const observer = new MutationObserver(() => {
      clearTimeout(rescanTimer);
      rescanTimer = setTimeout(() => {
        storageGet(DEFAULTS).then((stored) => {
          const current = normalizeSettings({ ...DEFAULTS, ...stored });
          if (current.autoHighlight) {
            runScan({ allowPanelCreate: false });
          }
        });
      }, 700);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg?.type) return;

    if (msg.type === 'APDF_SCAN') {
      runScan({ allowPanelCreate: true })
        .then((summary) => sendResponse({ ok: true, ...summary }))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (msg.type === 'APDF_CLEAR') {
      clearHighlights({ removePanel: true });
      sendResponse({ ok: true });
    }
  });

  init();
})();
