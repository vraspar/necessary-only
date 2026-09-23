# Necessary Only — Local

Version **1.1.0** adds cosmetic newsletter/subscription-promotion hiding and independent cookie/promotion switches. It retains the 1.0.1 fixes for external links across shadow roots, conflicting accessible labels, and offscreen/obscured controls. If upgrading, replace the old files, reload the extension at `chrome://extensions`, and refresh website tabs.

A small Chrome extension that clicks explicit cookie rejection or necessary-only choices and hides supported signup promotions. It is enabled immediately after installation. No account, installation commands, or build step.

## Install

1. Keep this folder somewhere permanent. If you downloaded a ZIP, unzip it first.
2. Type `chrome://extensions` into Chrome's address bar.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select `extension/` in this repository (or the unzipped `necessary-only` folder) containing `manifest.json`.
5. Refresh your existing website tabs. New pages will be handled automatically.
6. Optionally pin **Necessary Only — Local** using Chrome's extensions menu.

Chrome will ask for website access because the extension reads banner text and clicks buttons. That access is inherently powerful. The readable source in this folder is the entire extension; there are no downloaded libraries or hidden build products.

## Behavior

- Clicks an exact, recognized rejection or necessary-only label inside a likely consent banner.
- Includes English and selected French, German, Spanish, Italian, Portuguese, Dutch, and Danish phrases. This is not complete language coverage.
- Works with late-inserted banners, supported web frames, and discoverable open shadow roots.
- Leaves accept-only, ambiguous, hidden, disabled, external-link, and form-submission controls alone.
- Requires the button to be inside its frame's viewport and not obscured at its center.
- Does not click settings, save, close, or accept-all as a fallback. It does not hide unresolved banners.
- Each button is clicked at most once, with a maximum of four automatic clicks per frame per page load.
- Manual pointer/keyboard interaction with a recognized banner stops automation in that frame until you reload.
- The popup can disable it globally or pause a hostname, including its embedded frames. Pausing one hostname does not pause all its subdomains.

## Newsletter and subscription promotions

“Hide signup promotions” is enabled by default, separately from “Reject optional cookies.” It hides a supported popup with CSS; it does not click its Close/Subscribe buttons, submit forms, change an account, or cancel a subscription. Turn cookie rejection off to use promotion hiding without automatic cookie clicks.

The first version supports small fixed-position, dismissible English newsletter/subscription offers in the main page. It leaves inline signup forms, native modal dialogs, embedded frames, shadow-root promotions, scroll-locked pages, and recognizable login/payment/consent/paywall flows alone. This intentionally leaves many promotions unsupported. It is not a paywall bypass or a browser-notification setting.

Turn promotion hiding off or pause the site to restore its hidden offers on an open page. A restored or manually touched popup remains available until reload. No generic body-scroll unlocking or removal of page overlays is attempted. A narrowly scoped Quince rule also handles its observed Attentive signup frame and reversibly removes that specific scroll lock; it stops when the signup frame has focus after real user interaction. There is a limit of 20 hides per page load.

A page can spoof these signals or observe a CSS change. This feature avoids automatic button handlers but cannot guarantee zero page-side effects or perfect classification. If something useful disappears, pause the site.

## Privacy and updates

Only the three feature switches and the hostnames you explicitly pause are saved in `chrome.storage.local`. There is no browsing-history log, analytics, account, synchronization, remote rule list, or extension-initiated network request. Websites may make their own network requests when their consent buttons are clicked.

Permissions are `storage` and `activeTab`, plus content scripts on HTTP/HTTPS pages. `activeTab` lets the popup identify the site you are pausing. The background worker reads each content script's top-level hostname transiently so the pause also applies to iframes. There is no cookie-management, history, debugger, native-messaging, or general `tabs` permission.

The extension has no third-party runtime dependencies and no automatic updater. Replacing these files and clicking **Reload** in `chrome://extensions` is the update mechanism. Do not also run another cookie auto-clicker if you want predictable choices.

## Limits

This is deliberately conservative. It will leave some popups visible, especially those needing multiple settings screens, form submission, unknown wording, very large pages, or closed shadow roots. It is not a universal banner remover.

It submits a visible choice; it cannot verify that a website honors that choice, prevent all tracking, delete cookies already set, or undo a previously accepted choice. A deceptive website can mislabel a button. This version makes no claim of complete security or universal rejection.

Version 1.1.0 passed the 27-check cookie/settings/upstream-reproduction suite and 29 additional promotion/control checks in isolated Chrome 153. Adversarial fixtures still reproduce the fundamental fake-cookie-button risk. The earlier 1.0.0 also passed the original suite in Chrome for Testing 127. Live tests confirmed cookie rejection on IKEA, Boden, and Mango; an unsupported Guardian privacy notice and blocked/no-banner attempts are also documented. This is a small sample, not broad coverage evidence.

## Malicious or fake banners

A website can put an unrelated or harmful action behind a button labelled “Reject all.” The extension cannot authenticate a banner or constrain the website's own JavaScript handler. A click can therefore trigger a website request even though the extension itself has no network client. The security fixes reduce particular tricks; they do not eliminate this architectural risk.

For more control, use Chrome's **Details → Site access → On specific sites** and allow only sites where you want automatic clicks. The current extension default still runs wherever Chrome permits it. Site restrictions reduce exposure to unfamiliar sites, but cannot protect against every compromised site or misleading page.

## Remove

Open `chrome://extensions` and click **Remove**. This deletes the extension's stored preferences. Then delete this folder if desired.

Chrome's official installation instructions: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked

## Project records

- [Security boundaries](SECURITY.md)
- [Established-extension comparison](docs/comparison.md)
- [Test instructions](tests/README.md)
- [Observed live results](docs/validation.md)
- [Store preparation](docs/publishing.md)

Build a deterministic local-install ZIP with `python3 scripts/package.py`. Only `extension/` is packaged. No code bundling or dependency installation is needed. The repository is private; no distribution license has been chosen yet.
