(() => {
  'use strict';
  // Cosmetic-only. Never click, submit, close a dialog, read field values, or
  // change consent/account state. Page-owned code can still observe CSS changes.
  if (window !== window.top) return;
  const candidates = '[role="dialog"], [role="alertdialog"], ' +
    ['newsletter', 'subscribe', 'subscription', 'signup', 'sign-up'].flatMap(word =>
      [`[id*="${word}" i]`, `[class*="${word}" i]`]).join(', ');
  const promoText = /\b(?:newsletter|subscribe|subscription|sign up|join our (?:email|mailing)|email updates)\b/i;
  const protectedText = /\b(?:cookies?|tracking|consent|privacy preferences|paywall|subscribe to (?:continue|read|unlock)|subscription required|already (?:a )?subscriber|sign in|log in|password|checkout|payment|cancel (?:your )?subscription|manage (?:your )?subscription)\b/i;
  const closeLabels = new Set(['close', 'dismiss', 'no thanks', 'not now', 'maybe later', '×', 'x', 'close popup', 'close dialog', 'close modal']);
  const hidden = new Map();
  const unlocked = [];
  const touched = new WeakSet();
  let enabled = false, stopped = false, revision = 0, timer, lastScan = 0, hideCount = 0;

  function normalize(text) { return text.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!]+$/, ''); }
  function visible(node) {
    const rect = node.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < innerHeight && rect.left < innerWidth && getComputedStyle(node).visibility === 'visible';
  }
  function matches(node) {
    if (!(node instanceof HTMLElement) || touched.has(node) || !visible(node)) return false;
    if (node.matches('body, html, main, article, header, nav, dialog, [inert], [hidden]')) return false;
    // Do not disturb a native modal, a focus/scroll lock, or an overlay in a frame.
    // Those need individually reviewed site support, not generic unlocking.
    if (document.querySelector(':modal, [inert]')) return false;
    for (const root of [document.body, document.documentElement]) {
      const style = getComputedStyle(root);
      if (['hidden', 'clip'].includes(style.overflowY) || style.position === 'fixed') return false;
    }
    if (getComputedStyle(node).position !== 'fixed') return false;
    if (node.contains(document.activeElement) && document.activeElement !== document.body) return false;
    const text = node.innerText;
    if (text.length > 2500 || !promoText.test(text) || protectedText.test(text)) return false;
    if (node.querySelector('iframe, object, embed, [contenteditable], input[type="password"]')) return false;
    for (const field of node.querySelectorAll('input, select, textarea')) {
      // Only simple newsletter fields; never inspect their entered values.
      if (!field.matches('input[type="email"], input[type="checkbox"], input[type="hidden"], input[type="submit"], input[type="button"]')) return false;
      if (/cc-|card|password|payment|username/i.test(`${field.name} ${field.id} ${field.autocomplete}`)) return false;
    }
    return [...node.querySelectorAll('button, [role="button"]')].some(button =>
      visible(button) && closeLabels.has(normalize(button.getAttribute('aria-label') || button.innerText || '')));
  }
  function restore() {
    for (const [node, before] of hidden) {
      // Preserve later website changes instead of overwriting them.
      if (node.style.getPropertyValue('display') === 'none' && node.style.getPropertyPriority('display') === 'important') {
        if (before.value) node.style.setProperty('display', before.value, before.priority);
        else node.style.removeProperty('display');
      }
    }
    hidden.clear();
    for (const { node, property, value, priority } of unlocked) {
      if (!node.style.getPropertyValue(property)) node.style.setProperty(property, value, priority);
    }
    unlocked.length = 0;
  }
  function hide(node) {
    touched.add(node);
    hidden.set(node, { value: node.style.getPropertyValue('display'), priority: node.style.getPropertyPriority('display') });
    hideCount++;
    node.style.setProperty('display', 'none', 'important');
  }
  function hideQuinceOffer() {
    // Observed 2026-09-23. Exact site, vendor URL, structure and lock pattern.
    // This is a cosmetic site rule, not proof that the page/vendor is trustworthy.
    if (!['quince.com', 'www.quince.com'].includes(location.hostname)) return;
    const overlay = document.getElementById('attentive_overlay');
    if (!overlay || touched.has(overlay) || overlay.parentElement !== document.body || overlay.children.length !== 1) return;
    const frame = overlay.firstElementChild;
    if (!frame.matches('iframe#attentive_creative[title="Sign Up via Text for Offers"]') || !visible(frame)) return;
    let url;
    try { url = new URL(frame.src); } catch { return; }
    if (url.origin !== 'https://creatives.attn.tv' || url.pathname !== '/creatives-dynamic/multiPage/index.html') return;
    if (document.querySelector(':modal, [inert]') || (document.activeElement === frame && navigator.userActivation.hasBeenActive)) return;
    const roots = [document.documentElement, document.body];
    if (!roots.every(node => node.style.overflow === 'hidden' && node.style.position === 'absolute' && node.style.inset === '0px')) return;
    hide(overlay);
    for (const node of roots) for (const property of ['overflow', 'position', 'inset', 'height']) {
      const value = node.style.getPropertyValue(property);
      if (!value) continue;
      unlocked.push({ node, property, value, priority: node.style.getPropertyPriority(property) });
      node.style.removeProperty(property);
    }
  }
  function scan() {
    timer = undefined;
    lastScan = Date.now();
    if (!enabled || stopped || hideCount >= 20) return;
    hideQuinceOffer();
    // Bounded traversal; pages can be adversarially large.
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
    for (let i = 0, node; i < 5000 && (node = walker.nextNode()); i++) {
      if (hideCount >= 20) break;
      if (!node.matches(candidates) || !matches(node)) continue;
      hide(node);
    }
  }
  function schedule() {
    if (!enabled || stopped || timer !== undefined || hideCount >= 20) return;
    timer = setTimeout(scan, Math.max(150, 1000 - (Date.now() - lastScan)));
  }
  const observer = new MutationObserver(schedule);
  async function refreshPolicy() {
    const current = ++revision;
    try {
      const policy = await chrome.runtime.sendMessage({ type: 'policy' });
      if (current !== revision || stopped) return;
      enabled = policy?.enabled === true && policy.hidePromotions === true;
    } catch {
      if (current !== revision) return;
      enabled = false;
    }
    if (enabled) {
      observer.observe(document, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'role', 'aria-label'], characterData: true });
      schedule();
    } else { observer.disconnect(); clearTimeout(timer); timer = undefined; restore(); }
  }
  // Once the user touches a promotion, leave it available for this page load.
  for (const name of ['pointerdown', 'keydown']) document.addEventListener(name, event => {
    if (!event.isTrusted) return;
    for (const node of event.composedPath()) {
      if (node instanceof HTMLElement && node.matches(candidates)) touched.add(node);
    }
  }, true);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    enabled = false;
    refreshPolicy();
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('pagehide', event => {
    if (!event.persisted) { stopped = true; clearTimeout(timer); observer.disconnect(); }
  });
  window.addEventListener('pageshow', refreshPolicy);
  refreshPolicy();
})();
