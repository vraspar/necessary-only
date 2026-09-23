(() => {
  "use strict";
  // Exact labels only. No "accept all", close, save, continue, or settings fallback.
  const labels = new Set([
    "reject", "reject all", "reject all cookies", "reject optional cookies",
    "reject non-essential cookies", "reject non essential cookies", "decline all",
    "decline optional cookies", "deny all", "refuse all", "do not accept",
    "necessary only", "only necessary", "only necessary cookies",
    "accept necessary cookies", "accept only necessary cookies", "allow only necessary cookies",
    "accept strictly necessary cookies", "use necessary cookies only",
    "essential only", "only essential cookies", "accept essential cookies only",
    "accept only essential cookies", "continue without accepting", "continue without agreeing",
    "tout refuser", "refuser tout", "continuer sans accepter", "uniquement nécessaires",
    "alle ablehnen", "alles ablehnen", "nur notwendige", "nur notwendige cookies",
    "rechazar todo", "rechazar todas", "solo necesarias", "rechazar cookies opcionales",
    "rifiuta tutto", "solo necessari", "recusar todos", "rejeitar todos",
    "alles weigeren", "alleen noodzakelijke cookies", "afvis alle", "kun nødvendige"
  ]);
  const controls = 'button, input[type="button"], input[type="submit"], a, [role="button"]';
  const knownContainers = '#onetrust-banner-sdk, #onetrust-pc-sdk, #CybotCookiebotDialog, ' +
    '#didomi-host, #didomi-notice, #qc-cmp2-container, #truste-consent-track, ' +
    '#usercentrics-root, #usercentrics-cmp-ui, #consent-manager, .osano-cm-dialog, ' +
    '.cc-window, .cmplz-cookiebanner, #cookiebanner, #cookie-banner, #cookie-consent';
  const marker = /(?:cookie|consent|gdpr|privacy[-_ ]?(?:banner|dialog|modal))/i;
  const topic = /(?:cookies?|tracking|personal data|consent|confidentialit|datenschutz|privacidad|biscotti)/i;
  const clicked = new WeakSet();
  const observed = new WeakSet();
  const observers = [];
  let enabled = false;
  let timer;
  let lastScan = 0;
  let clickCount = 0;
  let userInteracting = false;
  let stopped = false;
  let policyRevision = 0;

  function normalize(value) {
    return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  }

  function parentOf(element) {
    return element.assignedSlot || element.parentElement || element.getRootNode().host || null;
  }

  function isConsentControl(element) {
    // A known CMP container, or a small banner/dialog with consent-related identity/text.
    for (let node = parentOf(element), depth = 0; node && depth < 10; node = parentOf(node), depth++) {
      if (node === document.body || node === document.documentElement) break;
      if (node.matches(knownContainers)) return true;
      const identity = `${node.id} ${node.getAttribute('class') || ''} ${node.getAttribute('aria-label') || ''}`;
      const dialog = node.matches('dialog, [role="dialog"], [role="alertdialog"]');
      if ((marker.test(identity) || dialog) && node.textContent.length < 12000 && topic.test(node.textContent)) return true;
    }
    return false;
  }

  function isVisible(element) {
    if (!element.isConnected || element.disabled || element.closest('[inert], [aria-disabled="true"], [hidden]')) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    for (let node = element; node; node = parentOf(node)) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
    }
    // Require the control to be in the viewport and actually exposed to a pointer.
    const left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
    const top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    if (right - left < 2 || bottom - top < 2) return false;
    const x = (left + right) / 2, y = (top + bottom) / 2;
    let hit = document.elementFromPoint(x, y);
    for (let depth = 0; hit?.shadowRoot && depth < 40; depth++) {
      const deeper = hit.shadowRoot.elementFromPoint(x, y);
      if (!deeper || deeper === hit) break;
      hit = deeper;
    }
    for (let node = hit; node; node = parentOf(node)) if (node === element) return true;
    return false;
  }

  function safeChoice(element) {
    if (clicked.has(element) || !isVisible(element) || !isConsentControl(element)) return false;
    // Require visible text and accessible label to agree when both exist.
    const text = normalize(element instanceof HTMLInputElement ? element.value : element.innerText || element.textContent || '');
    const aria = normalize(element.getAttribute('aria-label') || '');
    if (!(text || aria) || (text && !labels.has(text)) || (aria && !labels.has(aria))) return false;
    // aria-labelledby takes precedence over aria-label in the accessible name.
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy !== null) {
      const ids = labelledBy.trim().split(/\s+/).filter(Boolean);
      if (!ids.length) return false;
      const root = element.getRootNode();
      const nodes = ids.map(id => root.getElementById(id));
      if (nodes.some(node => !node)) return false;
      if (!labels.has(normalize(nodes.map(node => node.textContent).join(' ')))) return false;
    }
    // Never follow an external link, download, or execute a javascript: URL.
    // Check ancestors across shadow roots, where Element.closest() stops.
    for (let node = element; node; node = parentOf(node)) {
      if (node.matches('a') && (node.hasAttribute('download') || (node.getAttribute('href') && node.getAttribute('href') !== '#'))) return false;
      // Forms can trigger unrelated transactions. Leave them to the user.
      if (node.matches('form') || node.form || node.hasAttribute('form') || node.hasAttribute('inert') ||
          node.hasAttribute('hidden') || node.getAttribute('aria-disabled') === 'true') return false;
    }
    return true;
  }

  function watch(root) {
    if (observed.has(root)) return;
    observed.add(root);
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'disabled', 'aria-label'], characterData: true });
    observers.push(observer);
  }

  function scan() {
    timer = undefined;
    lastScan = Date.now();
    if (!enabled || stopped || userInteracting || clickCount >= 4) return;
    const roots = [document];
    for (let index = 0; index < roots.length && index < 40; index++) {
      const root = roots[index];
      watch(root);
      // Open shadow roots are accessible; closed roots deliberately remain untouched.
      for (const node of Array.from(root.querySelectorAll('*')).slice(0, 5000)) {
        if (node.shadowRoot && roots.length < 40) roots.push(node.shadowRoot);
      }
      for (const element of Array.from(root.querySelectorAll(controls)).slice(0, 800)) {
        if (safeChoice(element)) {
          clicked.add(element);
          clickCount++;
          element.click();
          schedule();
          return;
        }
      }
    }
  }

  function schedule() {
    if (!enabled || stopped || userInteracting || timer !== undefined || clickCount >= 4) return;
    timer = setTimeout(scan, Math.max(150, 750 - (Date.now() - lastScan)));
  }

  async function refreshPolicy() {
    const revision = ++policyRevision;
    try {
      const policy = await chrome.runtime.sendMessage({ type: 'policy' });
      if (revision !== policyRevision) return;
      enabled = policy?.enabled === true && policy.rejectCookies === true;
    } catch {
      if (revision !== policyRevision) return;
      enabled = false;
    }
    if (enabled) {
      watch(document);
      schedule();
    }
  }

  // Manual interaction takes priority until the next page load.
  for (const eventName of ['pointerdown', 'keydown']) {
    document.addEventListener(eventName, event => {
      if (event.isTrusted && event.composedPath().some(node => node instanceof Element && isConsentControl(node))) {
        userInteracting = true;
      }
    }, true);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      // Stop immediately; re-enable only after the background confirms current policy.
      enabled = false;
      refreshPolicy();
    }
  });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) {
      stopped = true;
      clearTimeout(timer);
      observers.forEach(observer => observer.disconnect());
    }
  });
  window.addEventListener('pageshow', refreshPolicy);
  refreshPolicy();
})();
