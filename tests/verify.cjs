const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const extension = path.join(root, 'extension');
fs.mkdirSync(path.join(root,'work'),{recursive:true});
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
const profile = fs.mkdtempSync(path.join(root, 'work/test-profile-'));
const results = [];
const errors = [];
const remoteRequests = [];
const base = 'https://cookie-fixture.test';
const modern = process.env.LEGACY_CHROME !== '1';
const pause = ms => new Promise(r => setTimeout(r, ms));
const banner = (buttons, attrs = 'id="cookie-banner"') => `<section ${attrs}><h2>Cookie preferences</h2><p>We use cookies for analytics and advertising.</p>${buttons}</section>`;
const button = (label, id = 'reject', extra = '') => `<button id="${id}" ${extra}>${label}</button>`;
const documentHTML = body => `<!doctype html><html><head><meta charset="utf-8"><title>Cookie fixture</title><style>body{font:16px system-ui;padding:30px}section,dialog{padding:24px;border:1px solid #aaa}button{padding:12px;margin:8px}</style></head><body>${body}<script>window.clicks=[];document.addEventListener('click',e=>{const b=e.target.closest('button,a,input,[role=button]');if(b){window.clicks.push(b.id);if(b.dataset.remove)b.parentElement.remove();}});</script></body></html>`;

(async () => {
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--headless=new', ...(modern ? ['--enable-unsafe-extension-debugging'] : [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`])],
    viewport: { width: 1100, height: 800 }
  });
  let body = '';
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cookie-fixture.test' || url.hostname === 'frame-fixture.test') {
      if (url.pathname.startsWith('/upstream/')) {
        const file = path.join(process.env.UPSTREAM_SOURCE || path.join(root, 'work/Consent-O-Matic'), 'Extension', path.basename(url.pathname));
        return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(file, 'utf8') });
      }
      return route.fulfill({ contentType: 'text/html', body: documentHTML(url.pathname === '/frame' ? banner(button('Reject all')) : body) });
    }
    if (!['chrome-extension:', 'data:', 'about:'].includes(url.protocol)) {
      remoteRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  try {
    if (modern) {
      const cdp = await context.browser().newBrowserCDPSession();
      await cdp.send('Extensions.loadUnpacked', { path: extension });
      await cdp.detach();
    }
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    async function check(name, html, expected, action) {
      body = html;
      await page.goto(`${base}/${results.length}`);
      if (action) await action(page);
      await pause(1200);
      const clicks = await page.evaluate(() => window.clicks);
      assert.deepEqual(clicks, expected, name);
      results.push({ name, pass: true });
      console.log('PASS', name);
    }
    await check('Reject all; accept untouched', banner(button('Accept all', 'accept') + button('Reject all')), ['reject']);
    await check('Necessary only choice', banner(button('Accept only necessary cookies')), ['reject']);
    await check('French reject', banner(button('Tout refuser'), 'role="dialog"'), ['reject']);
    await check('German reject', banner(button('Alle ablehnen')), ['reject']);
    await check('Spanish reject', banner(button('Rechazar todo')), ['reject']);
    await check('Accept-only banner stays visible', banner(button('Accept all', 'accept')), []);
    await check('Unrelated reject button untouched', '<section><h2>Pending invitations</h2>' + button('Reject all') + '</section>', []);
    await check('Ambiguous consent text untouched', banner(button('Reject all and subscribe')), []);
    await check('Contradictory accessible label untouched', banner(button('Reject all', 'reject', 'aria-label="Accept all"')), []);
    await check('Hidden choice untouched', banner(button('Reject all', 'reject', 'style="display:none"')), []);
    await check('Disabled choice untouched', banner(button('Reject all', 'reject', 'disabled')), []);
    await check('External link untouched', banner('<a id="reject" href="https://example.com/">Reject all</a>'), []);
    await check('Javascript link untouched', banner('<a id="reject" href="javascript:void(0)">Reject all</a>'), []);
    await check('Form submission untouched', banner('<form>' + button('Reject all', 'reject', 'type="submit"') + '</form>'), []);
    await check('Detached form target untouched', '<form id="purchase"></form>' + banner(button('Reject all', 'reject', 'form="purchase"')), []);
    await check('Visible consent dialog', banner(button('Continue without accepting'), 'role="dialog"'), ['reject']);
    await check('Delayed banner', '<p>Loading</p>', ['reject'], async p => {
      await pause(1000);
      await p.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), banner(button('Reject all')));
    });
    await check('Unresponsive button clicked only once', banner(button('Reject all')), ['reject'], async p => {
      await pause(1600);
      await p.evaluate(() => document.querySelector('section').classList.add('changed'));
    });
    await check('Open shadow root', '<div id="host"></div>', ['reject'], async p => {
      await p.evaluate(html => {
        const shadow = document.querySelector('#host').attachShadow({ mode: 'open' });
        shadow.innerHTML = html;
        shadow.addEventListener('click', e => window.clicks.push(e.target.id));
        document.querySelector('#host').appendChild(document.createElement('i'));
      }, banner(button('Reject all')));
    });
    await check('Manual banner interaction takes priority', banner('<button id="settings">Settings</button>' + button('Reject all', 'reject', 'hidden')), ['settings'], async p => {
      await p.locator('#settings').click();
      await p.locator('#reject').evaluate(el => el.hidden = false);
    });
    await worker.evaluate(() => chrome.storage.local.set({ enabled: false }));
    await check('Global off', banner(button('Reject all')), []);
    await worker.evaluate(() => chrome.storage.local.set({ enabled: true, 'paused:cookie-fixture.test': true }));
    await check('Site pause', banner(button('Reject all')), []);
    await check('Site pause applies to cross-origin frames', '<iframe style="width:600px;height:400px" src="https://frame-fixture.test/frame"></iframe>', [], async p => {
      const frame = p.frames().find(f => f.url().includes('frame-fixture'));
      await pause(1200);
      assert.deepEqual(await frame.evaluate(() => window.clicks), []);
    });
    await worker.evaluate(() => chrome.storage.local.remove('paused:cookie-fixture.test'));
    await check('Visible cross-origin frame rejection', '<iframe style="width:600px;height:400px" src="https://frame-fixture.test/frame"></iframe>', [], async p => {
      const frame = p.frames().find(f => f.url().includes('frame-fixture'));
      await pause(1200);
      assert.deepEqual(await frame.evaluate(() => window.clicks), ['reject']);
    });
    await check('Disabling on an already-open page', '<p>Waiting</p>', [], async p => {
      await worker.evaluate(() => chrome.storage.local.set({ enabled: false }));
      await pause(200);
      await p.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), banner(button('Reject all')));
    });
    if (process.env.UPSTREAM_SOURCE) {
    // Run the unmodified upstream OneTrust UTILITY rule against an accept-only fixture.
    body = banner(button('Accept all', 'onetrust-accept-btn-handler'), 'id="onetrust-banner-sdk"');
    await page.goto(`${base}/upstream-proof`);
    const rule = JSON.parse(fs.readFileSync(path.join(process.env.UPSTREAM_SOURCE, 'rules/onetrust_banner.json'))).onetrust_banner;
    await page.evaluate(async config => {
      const { default: Engine } = await import('/upstream/ConsentEngine.js');
      const { default: CMP } = await import('/upstream/CMP.js');
      Engine.debugValues = {};
      Engine.generalSettings = { hideInsteadOfPIP: true };
      Engine.singleton = { pipEnabled: false, registerClick() {}, currentMethodDone() {} };
      const cmp = new CMP('onetrust_banner', config);
      if (cmp.detect() && cmp.isShowing()) await cmp.runMethod('UTILITY', { A:false, B:false, D:false, E:false, F:false, X:false });
    }, rule);
    assert.deepEqual(await page.evaluate(() => window.clicks), ['onetrust-accept-btn-handler']);
    results.push({ name: 'Unmodified upstream rule reproduces accept fallback with all categories false', pass: true });
    console.log('PASS upstream accept fallback reproduced');
    }
    // Verify the packaged popup loads with real extension APIs and local storage.
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.locator('#enabled').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#enabled').disabled);
    await page.locator('#enabled').check();
    assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('enabled')).enabled), true);
    await page.screenshot({ path: path.join(root, 'work/popup.png') });
    results.push({ name: 'Packaged popup loads and saves global toggle', pass: true });
    assert.deepEqual(errors, [], 'Browser JavaScript errors');
    assert.deepEqual(remoteRequests, [], 'Unexpected external requests');
    fs.writeFileSync(path.join(root, 'test-results/test-results.json'), JSON.stringify({ testedAt: new Date().toISOString(), browser: await context.browser().version(), testCount: results.length, results, pageErrors: errors, unexpectedExternalRequests: remoteRequests, scope: 'Actual unpacked extension in an isolated browser profile with synthetic pages. Not a live-web coverage study.' }, null, 2));
    console.log(`All ${results.length} checks passed. No page errors or external requests observed.`);
  } finally { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
