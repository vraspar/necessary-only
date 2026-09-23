const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root,'work'),{recursive:true});
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
const extension = fs.mkdtempSync(path.join(root, 'work/live-extension-'));
fs.cpSync(path.join(root, 'extension'), extension, { recursive: true });
const extensionVersion = JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'))).version;
const sourceSHA256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(extension,'content.js'))).digest('hex');
const out = path.resolve(process.env.LIVE_OUTPUT || path.join(root, 'test-results/live-test'));
fs.mkdirSync(out, { recursive: true });
const sites = [
  ['quince', 'Quince', 'https://www.quince.com/'],
  ['hm', 'H&M', 'https://www2.hm.com/en_gb/index.html'],
  ['zara', 'Zara', 'https://www.zara.com/uk/'],
  ['uniqlo', 'UNIQLO', 'https://www.uniqlo.com/uk/en/'],
  ['nike', 'Nike', 'https://www.nike.com/gb/'],
  ['asos', 'ASOS', 'https://www.asos.com/'],
  ['adidas', 'Adidas', 'https://www.adidas.co.uk/'],
  ['ikea', 'IKEA', 'https://www.ikea.com/gb/en/'],
  ['bbc', 'BBC', 'https://www.bbc.com/'],
  ['guardian', 'The Guardian', 'https://www.theguardian.com/international'],
  ['wikipedia', 'Wikipedia', 'https://en.wikipedia.org/wiki/Main_Page'],
  ['patagonia', 'Patagonia', 'https://eu.patagonia.com/gb/en/home/'],
  ['boden', 'Boden', 'https://www.boden.co.uk/'],
  ['johnlewis', 'John Lewis', 'https://www.johnlewis.com/'],
  ['next', 'Next', 'https://www.next.co.uk/'],
  ['decathlon', 'Decathlon', 'https://www.decathlon.co.uk/'],
  ['mango', 'Mango', 'https://shop.mango.com/gb/en/']
];
const selected = process.env.SITES ? sites.filter(s => process.env.SITES.split(',').includes(s[0])) : sites;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const profiles = [];
const contexts = [];
const evidence = [];

async function launch(enabled) {
  const profile = fs.mkdtempSync(path.join(root, 'work/live-profile-'));
  profiles.push(profile);
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--headless=new', '--enable-unsafe-extension-debugging'],
    viewport: { width: 1440, height: 1000 }, locale: 'en-GB', timezoneId: 'America/Toronto'
  });
  contexts.push(context);
  const cdp = await context.browser().newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: extension });
  await cdp.detach();
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(value => chrome.storage.local.set({ enabled: value }), enabled);
  return context;
}

async function inspect(context, site, enabled) {
  const [id, name, url] = site;
  const clicks = [];
  const errors = [];
  const row = { id, name, requestedURL: url, enabled, startedAt: new Date().toISOString(), clicks, errors };
  const page = await context.newPage();
  page.on('pageerror', error => { if (errors.length < 8) errors.push(error.message.slice(0, 300)); });
  await page.exposeBinding('__recordConsentTestClick', ({ frame }, value) => clicks.push({ frame: frame.url(), ...value }));
  await page.addInitScript(() => {
    document.addEventListener('click', event => {
      const element = event.composedPath().find(n => n instanceof Element && n.matches('button,a,input,[role="button"]'));
      if (element) window.__recordConsentTestClick({ label: (element.innerText || element.value || element.textContent || '').trim().slice(0, 160), id: element.id, ariaLabel: element.getAttribute('aria-label'), trusted: event.isTrusted, at: Date.now() }).catch(() => {});
    }, true);
  });
  try {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      row.status = response?.status();
    } catch (error) { row.navigationError = error.message.slice(0, 500); }
    await delay(12000);
    row.finalURL = page.url();
    row.title = await page.title();
    row.frames = [];
    for (const frame of page.frames()) {
      try {
        const snapshot = await frame.evaluate(() => {
          function visible(el) { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width>1 && r.height>1 && s.visibility==='visible' && s.display!=='none'; }
          const roots=[document];
          for(let i=0;i<roots.length && i<30;i++) for(const e of Array.from(roots[i].querySelectorAll('*')).slice(0,10000)) if(e.shadowRoot && roots.length<30) roots.push(e.shadowRoot);
          const controls=roots.flatMap(r=>Array.from(r.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"]'))).filter(visible).map(e=>({text:(e.innerText||e.value||e.textContent||'').trim().slice(0,180),id:e.id,ariaLabel:e.getAttribute('aria-label'),form:!!(e.closest('form')||e.form),context:e.parentElement?.outerHTML.slice(0,1300)})).filter(e=>/cookie|consent|reject|accept|necessary|essential|privacy|agree|decline|allow all|deny|manage preferences/i.test(e.text+' '+e.id+' '+e.ariaLabel)).slice(0,25);
          return { text: (document.body?.innerText || '').slice(0,14000), controls };
        });
        if (frame === page.mainFrame() || snapshot.controls.length) row.frames.push({url:frame.url(),...snapshot});
      } catch {}
    }
    const frameURLs = page.frames().map(f=>f.url()).filter(u=>u.startsWith('http'));
    const consentCookies = (frameURLs.length ? await context.cookies(frameURLs) : []).filter(c => /OptanonConsent|OptanonAlertBoxClosed|CookieConsent$|^cookie_consent$|^cookieconsent|^consent$|^didomi|^euconsent|^eupubconsent|^SOCS$|^CONSENT$|^privacy|^uc_settings/i.test(c.name));
    row.consentCookies = consentCookies.map(c=>({ name:c.name, domain:c.domain, value:c.value.slice(0,2500) }));
    row.screenshot = `${id}-${enabled?'enabled':'baseline'}.png`;
    await page.screenshot({path:path.join(out,row.screenshot),timeout:10000});
    console.log(JSON.stringify({site:name,enabled,status:row.status,title:row.title,clicks:clicks.map(c=>c.label),controls:row.frames.flatMap(f=>f.controls.map(c=>c.text)).slice(0,12),cookies:consentCookies.map(c=>c.name)}));
  } catch (error) { row.testError=error.message; console.log(JSON.stringify({site:name,enabled,error:error.message.slice(0,250)})); }
  finally { await page.close().catch(()=>{}); }
  evidence.push(row);
  fs.writeFileSync(path.join(out,'live-results.json'),JSON.stringify({browser:await context.browser().version(),extensionVersion,sourceSHA256,method:'Same unmodified extension installed from a frozen snapshot in two fresh isolated profiles, disabled versus enabled. Public pages over real network; 12-second observation after DOMContentLoaded or navigation timeout. Locale en-GB; network region not changed or independently verified. No manual clicks. Main-world event listener records DOM clicks without altering extension code.',results:evidence},null,2));
}

(async()=>{
  try {
    const baseline=await launch(false);
    const enabled=await launch(true);
    for(let i=0;i<selected.length;i+=2) {
      const batch=selected.slice(i,i+2);
      const tasks=batch.flatMap(site=>[inspect(baseline,site,false),inspect(enabled,site,true)]);
      const results=await Promise.allSettled(tasks);
      results.forEach(r=>{if(r.status==='rejected') console.error(r.reason);});
    }
  } finally {
    for(const context of contexts) await context.close().catch(()=>{});
    for(const profile of profiles) fs.rmSync(profile,{recursive:true,force:true});
    fs.rmSync(extension,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
