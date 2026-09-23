const enabled = document.querySelector('#enabled');
const options = ['rejectCookies', 'hidePromotions'].map(id => document.getElementById(id));
const paused = document.querySelector('#paused');
const status = document.querySelector('#status');
let siteKey;

async function start() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported page');
    document.querySelector('#site').textContent = url.hostname;
    siteKey = `paused:${url.hostname}`;
  } catch {
    document.querySelector('#site').textContent = 'Open a normal website to pause it here.';
  }
  const settings = await chrome.storage.local.get(['enabled', 'rejectCookies', 'hidePromotions', ...(siteKey ? [siteKey] : [])]);
  enabled.checked = settings.enabled !== false;
  enabled.disabled = false;
  for (const input of options) { input.checked = settings[input.id] !== false; input.disabled = false; }
  if (siteKey) {
    paused.checked = settings[siteKey] === true;
    paused.disabled = false;
  }
}

async function save(input, action) {
  input.disabled = true;
  try { await action(); status.textContent = 'Saved on this device.'; }
  catch { status.textContent = 'Could not save. Reopen this popup and try again.'; input.checked = !input.checked; }
  finally { input.disabled = false; }
}
enabled.addEventListener('change', () => save(enabled, () => chrome.storage.local.set({ enabled: enabled.checked })));
for (const input of options) input.addEventListener('change', () => save(input, () => chrome.storage.local.set({ [input.id]: input.checked })));
paused.addEventListener('change', () => save(paused, () => paused.checked
  ? chrome.storage.local.set({ [siteKey]: true }) : chrome.storage.local.remove(siteKey)));
start().catch(() => { status.textContent = 'Could not load settings. Reopen this popup to retry.'; });
