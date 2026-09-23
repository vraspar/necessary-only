# Validation, 2026-09-23

Version 1.1.0 was loaded as an actual unpacked extension into isolated Chrome 153.0.8010.53 profiles, using Playwright 1.57.0. No personal browser profile, account login, purchase, or real user secret was used.

## Automated fixtures

- 26 cookie/settings regressions passed, including visible rejection, necessary-only choice, selected languages, frame/shadow handling, form/link exclusions, manual override, pause and popup settings.
- One separate upstream observation reproduced Consent-O-Matic's accept fallback. It is included in the 27-entry original regression result and is not a Necessary Only feature check.
- 29 promotion/control checks passed. These cover no close/click/submit handlers, recognizable login/payment/consent flows remaining visible, user interaction, global/site controls, restoring styles, exact Quince host/vendor matching, lookalikes, and focus handling.
- Ten adversarial observations reconfirmed the 1.0.1 safeguards and the unresolved fake-cookie-button risk. The synthetic page's handler sends a synthetic localStorage value to an intercepted fixture endpoint. This is an intentional risk reproduction, not “ten security tests passed.”

The author also reviewed the code. There has been no independent security audit. Passing these tests is not proof that every malicious page, browser bug, website layout, or update is safe.

## Real websites

| Site | Version 1.1.0 observation |
| --- | --- |
| IKEA UK | Automatic Reject all click recorded; consent interaction recorded and optional groups zero. The paired disabled observation did not expose a banner in this run, so the earlier 1.0.1 visible-banner pair provides additional baseline evidence. |
| Boden UK | Visible banner in disabled profile; REJECT ALL click, banner removal and necessary-only consent groups in enabled profile. |
| Mango UK | ONLY NECESSARY COOKIES click; cookie modal removed. A separate country selector remains. Persistent consent state was not decoded. |
| BBC | No promotional popup reproduced in this visit. Ordinary Subscribe navigation remains. No automatic click. No coverage claim. |
| Quince | Its actual Attentive signup offer was hidden. Scroll advanced from 0 to 650 pixels. Turning promotion hiding off restored the iframe and its original scroll lock. No clicks recorded. Screenshots also inspected. |

Quince initially exposed a limitation in the conservative generic matcher: it is a cross-origin frame with a scroll lock and automatic focus. The delivered adapter is scoped to the exact Quince hostnames, observed vendor URL/path/title/structure, and inline lock pattern. Separate fixtures ensure real user activation in a focused signup frame prevents hiding. This is one site-specific success, not universal newsletter support.

Earlier 1.0.0/1.0.1 live coverage attempted 16 sites: IKEA, Boden and Mango worked; a Guardian US privacy notice was unsupported; Nike, BBC and Wikipedia showed no actionable cookie banner; nine attempts were inconclusive because of access denials, interstitials or network failures (H&M, Zara, UNIQLO, ASOS, Adidas, Next, Decathlon, John Lewis and Patagonia). Access controls were not bypassed.

The results depend on time, region and site experiments. Rejecting a consent interface does not establish that the site honors the preference or has stopped all tracking. Raw website-issued identifiers and temporary profiles are intentionally absent from this repository.

`evidence/promotions-results.json` contains runtime hashes; `evidence/quince-live-results.json` pins the tested promotional script. `evidence/release-sha256.json` lists all packaged files. Changes require fresh relevant verification. Hashes establish identity, not safety.
