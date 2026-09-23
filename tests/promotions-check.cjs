const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'), extension=path.resolve(process.env.TEST_EXTENSION||path.join(root,'extension'));
fs.mkdirSync(path.join(root,'work'),{recursive:true});
fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
const profile=fs.mkdtempSync(path.join(root,'work/promotions-profile-'));
const rows=[]; const pause=ms=>new Promise(r=>setTimeout(r,ms));
const promo=(text='Join our newsletter',extra='',fields='<input type="email">')=>`<section id="newsletter-popup" style="position:fixed;top:20px;left:20px;padding:30px;background:white;${extra}"><h2>${text}</h2><form>${fields}<button type="submit" id="subscribe">Subscribe</button></form><button id="close" type="button">No thanks</button></section>`;
(async()=>{
 const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,ignoreDefaultArgs:['--disable-extensions'],args:['--headless=new','--enable-unsafe-extension-debugging']});
 try{
 const cdp=await context.browser().newBrowserCDPSession();const{id}=await cdp.send('Extensions.loadUnpacked',{path:extension});await cdp.detach();
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');let html='',requests=[];
 await context.route('**/*',r=>{
 if(r.request().resourceType()==='document' && r.request().frame().parentFrame()) return r.fulfill({contentType:'text/html',body:'Synthetic signup frame'});
 if(['promo-fixture.test','www.quince.com','quince.com.evil.test'].includes(new URL(r.request().url()).hostname))return r.fulfill({contentType:'text/html',body:`<!doctype html><body><main>Useful content</main>${html}<script>window.events=[];for(const n of ['click','submit','close'])document.addEventListener(n,e=>{window.events.push(n);fetch('https://attacker-fixture.test/'+n);e.preventDefault()},true)</script>`});
 if(r.request().url().startsWith('https://')){requests.push(r.request().url());return r.fulfill({body:'intercepted locally'});}return r.continue();});
 const page=await context.newPage();
 async function check(name,body,expectHidden,action,selector='#newsletter-popup',host='promo-fixture.test'){
 html=body;requests=[];await page.goto('https://'+host+'/'+rows.length);if(action)await action(page);await pause(1300);
 const actual=await page.locator(selector).evaluate(n=>getComputedStyle(n).display==='none');assert.equal(actual,expectHidden,name);
 assert.deepEqual(await page.evaluate(()=>window.events),[],name+' no handlers');assert.deepEqual(requests,[],name+' no outbound requests');rows.push({name,pass:true});console.log('PASS',name);
 }
 await check('Newsletter hidden without close, click, or submit handlers',promo(),true);
 await check('Dismissible subscription promotion hidden',promo('Subscribe now for our special offer'),true);
 await check('Inline signup stays visible',promo().replace('position:fixed','position:static'),false);
 await check('Unknown dialog remains visible',promo('Confirm your action').replace('<button type="submit" id="subscribe">Subscribe</button>',''),false);
 await check('Cookie consent remains visible',promo('Newsletter and cookie consent preferences'),false);
 await check('Login lookalike remains visible',promo('Sign in to your subscription'),false);
 await check('Password form remains visible',promo('Join our newsletter','','<input type="password">'),false);
 await check('Payment field remains visible',promo('Subscribe now','','<input type="email" name="card-number">'),false);
 await check('Paywall remains visible',promo('Subscribe to continue reading'),false);
 await check('Account cancellation stays visible',promo('Cancel your subscription'),false);
 await check('Native modal stays visible',promo().replace('<section','<dialog').replace('</section>','</dialog>')+'<script>document.querySelector("dialog").showModal()</script>',false);
 await check('Scroll-locked page stays intact','<style>body{overflow:hidden}</style>'+promo(),false);
 await check('Inert page stays intact','<aside inert>Background</aside>'+promo(),false);
 await check('Undismissible promotion stays visible',promo().replace('<button id="close" type="button">No thanks</button>',''),false);
 await check('Focused email field stays visible',promo()+'<script>document.querySelector("input").focus()</script>',false);
 await check('Delayed popup is hidden','<div id="placeholder"></div>',true,async p=>{await pause(300);await p.evaluate(s=>document.querySelector('#placeholder').outerHTML=s,promo());});
 await check('Disabling promotion hiding restores original inline display',promo('Join our newsletter','display:flex !important;'),false,async p=>{
 await pause(1300);assert.equal(await p.locator('#newsletter-popup').evaluate(e=>getComputedStyle(e).display),'none');
 await worker.evaluate(()=>chrome.storage.local.set({hidePromotions:false}));await pause(250);
 assert.equal(await p.locator('#newsletter-popup').evaluate(e=>e.style.getPropertyValue('display')),'flex');
 assert.equal(await p.locator('#newsletter-popup').evaluate(e=>e.style.getPropertyPriority('display')),'important');});
 await worker.evaluate(()=>chrome.storage.local.set({hidePromotions:true,'paused:promo-fixture.test':true}));
 await check('Site pause stops promotional hiding',promo(),false);
 await worker.evaluate(()=>chrome.storage.local.remove('paused:promo-fixture.test'));
 await check('Pausing an open page restores hidden promotion',promo(),false,async()=>{await pause(1300);await worker.evaluate(()=>chrome.storage.local.set({'paused:promo-fixture.test':true}));});
 await worker.evaluate(()=>chrome.storage.local.set({'paused:promo-fixture.test':false,enabled:false}));
 await check('Global disable stops promotional hiding',promo(),false);
 await worker.evaluate(()=>chrome.storage.local.set({enabled:true,rejectCookies:false}));
 await check('Hiding works with all automatic cookie clicks disabled',promo()+'<aside id="cookie-banner"><p>Cookies</p><button>Reject all</button></aside>',true);
 const quince=(src='https://creatives.attn.tv/creatives-dynamic/multiPage/index.html',lock='hidden')=>`<div id="attentive_overlay" style="position:fixed"><iframe id="attentive_creative" title="Sign Up via Text for Offers" src="${src}" style="position:fixed;inset:0;width:100%;height:100%"></iframe></div><script>for(const n of [document.documentElement,document.body])n.style.cssText='overflow:${lock};position:absolute;inset:0';</script>`;
 await check('Quince exact vendor frame hidden without clicks',quince(),true,null,'#attentive_overlay','www.quince.com');
 assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
 await check('Quince automatic frame focus does not prevent hiding',quince().replace('<iframe ', '<iframe onload="this.focus()" '),true,null,'#attentive_overlay','www.quince.com');
 await worker.evaluate(()=>chrome.storage.local.set({enabled:false}));
 await check('Quince trusted interaction preserves focused signup frame',quince(),false,async p=>{
 await p.locator('#attentive_creative').click({position:{x:40,y:40}});
 assert.equal(await p.evaluate(()=>navigator.userActivation.hasBeenActive),true);
 await worker.evaluate(()=>chrome.storage.local.set({enabled:true}));
 },'#attentive_overlay','www.quince.com');
 await check('Quince lookalike hostname remains untouched',quince(),false,null,'#attentive_overlay','quince.com.evil.test');
 await check('Quince lookalike vendor URL remains untouched',quince('https://creatives.attn.tv.evil.test/creatives-dynamic/multiPage/index.html'),false,null,'#attentive_overlay','www.quince.com');
 await check('Quince unexpected lock state remains untouched',quince(undefined,'clip'),false,null,'#attentive_overlay','www.quince.com');
 await check('Quince pause restores iframe and original scroll lock',quince(),false,async()=>{await pause(1300);await worker.evaluate(()=>chrome.storage.local.set({'paused:www.quince.com':true}));},'#attentive_overlay','www.quince.com');
 assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
 const ui=await context.newPage();await ui.goto(`chrome-extension://${id}/popup.html`);await ui.waitForFunction(()=>!document.querySelector('#hidePromotions').disabled);
 assert.equal(await ui.locator('#rejectCookies').isChecked(),false);assert.equal(await ui.locator('#hidePromotions').isChecked(),true);
 await ui.locator('#hidePromotions').uncheck();await pause(250);assert.equal((await worker.evaluate(()=>chrome.storage.local.get('hidePromotions'))).hidePromotions,false);
 rows.push({name:'Independent popup controls reflect and save settings',pass:true});
 const sourceSHA256=Object.fromEntries(['content.js','promotions.js','background.js','popup.js','manifest.json'].map(n=>[n,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(extension,n))).digest('hex')]));
 fs.writeFileSync(path.join(root,'test-results/promotions-results.json'),JSON.stringify({browser:await context.browser().version(),extensionVersion:JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'))).version,sourceSHA256,at:new Date().toISOString(),testCount:rows.length,results:rows},null,2));
 }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
