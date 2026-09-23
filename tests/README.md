# Verification

Tests load the actual unpacked `extension/` folder in fresh disposable Chrome profiles. They do not attach to the user's Chrome session. Requires Node.js, Playwright (tested with 1.57.0), and a modern Chrome binary (tested with 153.0.8010.53).

```sh
npm install --no-save --ignore-scripts playwright@1.57.0
CHROME_EXECUTABLE='/absolute/path/to/chrome' node tests/verify.cjs
CHROME_EXECUTABLE='/absolute/path/to/chrome' node tests/promotions-check.cjs
CHROME_EXECUTABLE='/absolute/path/to/chrome' node tests/security-check.cjs
```

Alternatively set `PLAYWRIGHT_MODULE` to an existing installation. The scripts default to the standard Google Chrome app location on macOS. The extension has no dependency on this tooling. Chrome's `--enable-unsafe-extension-debugging` flag is confined to these temporary test profiles and is needed for the DevTools unpacked-extension loading API.

`verify.cjs` runs 26 extension regression checks. To reproduce the separate Consent-O-Matic observation, set `UPSTREAM_SOURCE` to a checkout of `cavi-au/Consent-O-Matic` pinned to `8ca8500d26434c586039e126ad091e1bfccd205d`; that adds a 27th check. No upstream build or npm scripts are needed.

`promotions-check.cjs` tests cosmetic hiding, hostile event handlers, false positives, independent controls, restoration, and a site-specific rule. Synthetic fixtures intercept all external traffic, including fake attacker requests. `security-check.cjs` records ten adversarial observations; the first intentionally demonstrates a residual unsafe click and is not a passing security guarantee.

Live tests make real network requests to public websites in fresh profiles:

```sh
SITES=ikea,boden,mango,bbc LIVE_OUTPUT=test-results/live node tests/live-sites.cjs
```

Raw live results may contain website-issued consent/session identifiers. They are ignored by Git. Commit reviewed summaries, not raw browser profiles or cookies. `evidence/` contains synthetic-test results and a sanitized live summary. Tests do not prove universal coverage or tracking prevention.
