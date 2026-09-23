# Security and popup-filtering comparison

Reviewed 2026-09-23. This was a targeted architecture/source review, not a full audit or certification of these products, their store binaries, every filter, dependencies, or update infrastructure. No upstream source was incorporated into the shipped extension.

| Project / pinned source | Observed mechanism | What it establishes |
| --- | --- | --- |
| [uBlock Origin / Lite code, d34727e](https://github.com/gorhill/uBlock/tree/d34727edfeef5ada28807edebe43073ced1142e9) | MV3 background inserts cosmetic CSS in the sender's tab/frame; ordinary hide rules use display:none. `trusted-click-element` is marked `requiresTrust: true` and runs in the isolated world. | Cosmetic hiding can avoid button handlers. Restricting who supplies action rules reduces rule-supply-chain exposure; it does not authenticate the website a rule acts on. This last distinction is our inference from the mechanism. |
| [uBO Lite distribution, ab24d42](https://github.com/uBlockOrigin/uBOL-home/tree/ab24d42e4b55aee24d246a852ffd0d8255564071) | Includes disabled-by-default **EasyList/uBO – Overlay Notices**, with EasyList newsletter sources. | There is already an established option for signup interruptions. A content-blocker install alone does not necessarily enable these optional filters. |
| [DuckDuckGo Autoconsent, 74e1667](https://github.com/duckduckgo/autoconsent/tree/74e1667e723601b0747a265c46a3c342aa3a768b) | `lib/dom-actions.ts` calls element.click for consent rules; separate cosmetic rules hide elements. Rules can constrain context. API documentation warns about main-world eval rules. | An established consent library also relies on page-owned actions. Isolation does not change the meaning of the site's handler. Cosmetic hiding is explicitly separate from actual consent-state changes. |
| [AdGuard official explanation](https://adguard.com/en/blog/new-annoyance-filters.html) | Separate Popups filter covers promotional notifications and newsletter signup annoyances. | Optional annoyance lists may solve this without writing more custom code. AdGuard implementation was not audited in this comparison. |
| [Consent-O-Matic, 8ca8500](https://github.com/cavi-au/Consent-O-Matic/tree/8ca8500d26434c586039e126ad091e1bfccd205d) | Earlier targeted review found mutable remote rule updates and an OneTrust utility fallback that clicks the accept button when preference controls are absent. | We reproduced the click using the actual upstream modules and a synthetic fixture, with all consent categories false. This is a reject-only behavior mismatch, not evidence that the project was hacked. |

Relevant exact paths in the uBlock source: `platform/mv3/extension/js/background.js` (insertCSS/removeCSS), `platform/mv3/extension/js/filter-manager.js` (plain-selector display:none CSS), `platform/mv3/rulesets.json` (annoyances-overlays), and `src/js/resources/scriptlets.js` (trusted-click-element). The uBO Lite distribution's `chromium/rulesets/ruleset-details.json` confirms that optional ruleset in the checked build.

Relevant DuckDuckGo paths: `lib/dom-actions.ts`, `lib/cmps/onetrust.ts`, `docs/rule-syntax.md`, and `docs/api.md`. No claim is made that every rule has the same behavior, or that the reviewed source matches a particular store package.

## Applying the findings

Necessary Only keeps its rules local and readable, with no rule downloader or arbitrary code evaluator. It separates automatic rejection from cosmetic promotional hiding. No permissions were added for version 1.1.0.

The generic cosmetic matcher requires a small fixed-position promotion with a dismiss control and skips recognizable credential/payment/consent flows and scroll-locked pages. One exact-site Quince adapter recognizes the observed Attentive iframe and scroll-lock pattern. It hides the wrapper, temporarily removes only those inline lock properties, and restores changes when disabled if the site has not overwritten them. It never enters the frame, clicks a close control, or sends a vendor message. Real user activation in a focused signup frame stops that adapter; automatic focus alone does not.

This trades coverage for a smaller action surface. It still cannot prove a page is honest. A malicious site can spoof the DOM, attach an unsafe cookie-button handler, or observe CSS changes. See [SECURITY.md](../SECURITY.md).

For broad everyday promotional-popup coverage, trying the official [uBO Lite](https://github.com/uBlockOrigin/uBOL-home) with its optional Overlay Notices list is reasonable. Cosmetic hiding alone does **not** record rejection of cookie consent. Do not mistake a disappearing cookie banner for a verified opt-out, and avoid overlapping cookie automation without checking its choices.
