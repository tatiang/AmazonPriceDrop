// Amazon Price Drop Finder extension v1.09
(() => {
  // Prevent duplicate injections from creating duplicate panels/observers
  if (window.__apdfAlreadyLoaded) return;
  window.__apdfAlreadyLoaded = true;
  const DEFAULTS = { threshold: 10, autoHighlight: true };
  const PANEL_ID = 'apdf-panel';
  const HIGHLIGHT_CLASS = 'apdf-highlight';

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
  }

  function moneyToNumber(s) {
    if (!s) return null;
    const cleaned = String(s).replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function fmtMoney(n) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n);
    } catch {
      return `$${n.toFixed(2)}`;
    }
  }

  const DROP_REGEX = /(.*?)\s+has\s+decreased\s+from\s+\$?\s*([\d,.]+)\s+to\s+\$?\s*([\d,.]+)/i;

  function computeDropFromText(text) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    if (!/has\s+decreased\s+from/i.test(t)) return null;
    const m = t.match(DROP_REGEX);
    if (!m) return null;
    const name = (m[1] || '').trim();
    const oldPrice = moneyToNumber(m[2]);
    const newPrice = moneyToNumber(m[3]);
    if (!oldPrice || !newPrice || oldPrice <= 0) return null;
    const pct = ((oldPrice - newPrice) / oldPrice) * 100;
    if (pct <= 0) return null; // never treat increases/flat as decreases
    return { name: name || 'Unknown item', oldPrice, newPrice, pct };
  }

  function extractAsinFromUrl(url) {
    if (!url) return null;
    const m = String(url).match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    return m ? m[1].toUpperCase() : null;
  }

  function findImportantMessagesContainer() {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,div,span')).filter(el => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return t.includes('important messages') && t.includes('cart');
    });

    for (const h of headings) {
      const box = h.closest('div');
      if (!box) continue;
      const ul = box.querySelector('ul');
      if (ul && ul.querySelector('li')) return box;
      const nextUl = box.parentElement?.querySelector('ul');
      if (nextUl && nextUl.querySelector('li')) return box.parentElement;
    }

    const candidate = Array.from(document.querySelectorAll('div')).find(div => {
      const t = (div.textContent || '').toLowerCase();
      return t.includes('important messages about items in your cart') && div.querySelector('li');
    });

    return candidate || null;
  }

  function scanFromImportantMessages() {
    const results = [];
    const container = findImportantMessagesContainer();
    if (!container) return results;

    const listItems = Array.from(container.querySelectorAll('li'));
    for (const li of listItems) {
      const drop = computeDropFromText(li.textContent || '');
      if (!drop) continue;

      const link = li.querySelector('a[href*="/dp/"], a[href*="/gp/product/"]');
      const asin = extractAsinFromUrl(link?.getAttribute('href') || '');

      results.push({ ...drop, element: li, asin });
    }
    return results;
  }

  function scanViaFallbackText() {
    const results = [];
    const seen = new WeakSet();

    const candidates = [
      ...document.querySelectorAll('li'),
      ...document.querySelectorAll('div, span, p')
    ];

    for (const el of candidates) {
      if (!el || seen.has(el)) continue;
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!txt || !txt.toLowerCase().includes('has decreased from')) continue;

      const computed = computeDropFromText(txt);
      if (!computed) continue;

      const highlightEl = el.closest('li') || el;
      if (highlightEl && seen.has(highlightEl)) continue;
      if (highlightEl) seen.add(highlightEl);

      results.push({ ...computed, element: highlightEl, asin: null });
    }

    return results;
  }

  
  function findMoveToCartButton(root) {
    if (!root) return null;
    // Common patterns Amazon uses for moving Saved-for-later items into cart
    return root.querySelector(
      'input[value*="Move to Cart"], input[value*="Add to Cart"], ' +
      'button[aria-label*="Move to Cart"], button[aria-label*="Add to Cart"], ' +
      'input[name*="submit.move-to-cart"], input[name*="moveToCart"], ' +
      'button[name*="move-to-cart"], button[data-action*="move-to-cart"]'
    );
  }

  function highlightMatchingCartItemByAsin(asin) {
    if (!asin) return null;
    const link = document.querySelector(`a[href*="/dp/${asin}"], a[href*="/gp/product/${asin}"]`);
    if (!link) return null;

    const cartRow =
      link.closest('[data-itemid]') ||
      link.closest('[data-asin]') ||
      link.closest('.sc-list-item') ||
      link.closest('.sc-item') ||
      link.closest('div');

    return cartRow || link;
  }

  function clearHighlights() {
    document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach(el => el.classList.remove(HIGHLIGHT_CLASS));
    document.querySelectorAll('.apdf-highlight-link').forEach(el => el.classList.remove('apdf-highlight-link'));
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
  }

  function removeDuplicatePanels() {
    const panels = document.querySelectorAll('#' + PANEL_ID);
    if (panels.length > 1) {
      panels.forEach((p, idx) => { if (idx > 0) p.remove(); });
    }
  }

  function createOrUpdatePanel(items, threshold) {
    removeDuplicatePanels();
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;

      const header = document.createElement('header');

      const left = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = 'Price drops';

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `Showing items with ≥${threshold}% decrease`;

      left.appendChild(title);
      left.appendChild(meta);

      const right = document.createElement('div');
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => panel.remove());
      right.appendChild(closeBtn);

      header.appendChild(left);
      header.appendChild(right);

      const content = document.createElement('div');
      content.className = 'content';

      panel.appendChild(header);
      panel.appendChild(content);
      document.documentElement.appendChild(panel);
    } else {
      const meta = panel.querySelector('.meta');
      if (meta) meta.textContent = `Showing items with ≥${threshold}% decrease`;
    }

    const content = panel.querySelector('.content');
    if (!content) return;
    content.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No qualifying price drops found on this page.';
      content.appendChild(empty);
      return;
    }

    items.sort((a, b) => b.pct - a.pct);

    for (const it of items) {
      const card = document.createElement('div');
      card.className = 'item';

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = it.name;

      const line = document.createElement('div');
      line.className = 'line';

      const prices = document.createElement('div');
      prices.textContent = `${fmtMoney(it.oldPrice)} → ${fmtMoney(it.newPrice)}`;

      const pct = document.createElement('div');
      pct.className = 'pct';
      pct.textContent = `−${it.pct.toFixed(1)}%`;

      line.appendChild(prices);
      line.appendChild(pct);

      card.appendChild(name);
      card.appendChild(line);

      // Add-to-cart control (only shown when a matching Move/Add button exists on the page)
      const moveBtn = findMoveToCartButton(it.cartElement) || findMoveToCartButton(it.element);
      if (moveBtn) {
        const addBtn = document.createElement('button');
        addBtn.className = 'apdf-add';
        addBtn.type = 'button';
        addBtn.textContent = 'Add to cart';
        addBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          try {
            moveBtn.click();
            addBtn.textContent = 'Added';
            addBtn.disabled = true;
            // Re-scan after Amazon updates the DOM
            setTimeout(() => runScan({ forcePanel: true }), 900);
          } catch {}
        });
        card.appendChild(addBtn);
      }

      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const target = it.cartElement || it.element;
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add(HIGHLIGHT_CLASS);
          target.animate([{ opacity: 1 }, { opacity: 0.75 }, { opacity: 1 }], { duration: 450 });
        }
      });

      content.appendChild(card);
    }
  }

  async function runScan({ forcePanel = true } = {}) {
    const settings = { ...DEFAULTS, ...(await storageGet(DEFAULTS)) };
    const threshold = Number(settings.threshold || DEFAULTS.threshold);

    let all = scanFromImportantMessages();
    if (!all.length) all = scanViaFallbackText();

    const qualifying = all.filter(it => it.pct >= threshold);

    document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach(el => el.classList.remove(HIGHLIGHT_CLASS));
    document.querySelectorAll('.apdf-highlight-link').forEach(el => el.classList.remove('apdf-highlight-link'));

    for (const it of qualifying) {
      if (it.element) {
        // Highlight the specific text (usually the product link) when possible
        const a = it.element.querySelector('a');
        if (a) a.classList.add('apdf-highlight-link');
        it.element.classList.add(HIGHLIGHT_CLASS);
      }
      if (it.asin) {
        const cartEl = highlightMatchingCartItemByAsin(it.asin);
        if (cartEl) {
          // Highlight the cart row and its title link for visibility
          cartEl.classList.add(HIGHLIGHT_CLASS);
          const titleLink = cartEl.querySelector('a[href*="/dp/"], a[href*="/gp/product/"]');
          if (titleLink) titleLink.classList.add('apdf-highlight-link');
          it.cartElement = cartEl;
        }
      }
    }

    if (forcePanel) createOrUpdatePanel(qualifying, threshold);

    return { scanned: all.length, qualifying: qualifying.length, threshold };
  }

  async function init() {
    const settings = { ...DEFAULTS, ...(await storageGet(DEFAULTS)) };
    if (settings.autoHighlight) runScan({ forcePanel: true });

    const obs = new MutationObserver(() => {
  // Prevent duplicate injections from creating duplicate panels/observers
  if (window.__apdfAlreadyLoaded) return;
  window.__apdfAlreadyLoaded = true;
      clearTimeout(init._t);
      init._t = setTimeout(() => {
  // Prevent duplicate injections from creating duplicate panels/observers
  if (window.__apdfAlreadyLoaded) return;
  window.__apdfAlreadyLoaded = true;
        storageGet(DEFAULTS).then(s => {
          if (s.autoHighlight) runScan({ forcePanel: true });
        });
      }, 600);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg?.type) return;

    if (msg.type === 'APDF_SCAN') {
      runScan({ forcePanel: true }).then((summary) => {
        sendResponse({ ok: true, ...summary });
      }).catch((err) => {
        sendResponse({ ok: false, error: String(err) });
      });
      return true; // async response
    }

    if (msg.type === 'APDF_CLEAR') {
      clearHighlights();
      sendResponse({ ok: true });
      return;
    }
  });

  init();
})();
