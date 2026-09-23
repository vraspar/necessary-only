# Security boundaries

This is an experimental personal extension, not a security product or an independently audited release.

A site owns its DOM and button handlers. It can label a harmful action “Reject all,” and automatic clicking can run that action. The extension's isolated JavaScript world prevents a page from replacing its JavaScript functions; it does not authenticate page content or constrain the website's event handlers. Our adversarial suite intentionally reproduces this residual risk using a synthetic value and intercepted traffic. It is not evidence of a browser/OS exploit or cross-origin credential access.

For fewer automatic actions, turn **Reject optional cookies** off. Promotion hiding can remain enabled independently. For stronger browser-enforced exposure limits, use Chrome's extension Details → Site access → On specific sites. The initial defaults remain enabled wherever Chrome permits the extension to run.

Promotion suppression changes CSS without dispatching clicks, closing dialogs, or submitting forms. Hostile pages can observe styling changes, spoof a match, or move content under the pointer. Cosmetic filtering is not a security boundary. Pause the site if something useful disappears.

The shipped extension has no runtime dependencies, remote rules, analytics, network client, dynamic evaluation, page-message bridge, externally accessible message handler, or privileged URL-fetching endpoint. It has storage and activeTab permissions; static content scripts still have broad access to the DOM of HTTP/HTTPS pages where Chrome permits them. The worker returns only boolean policy fields and uses Chrome-provided top-level tab identity. Settings remain in local extension storage.

The CSP forbids extension-page connections; it does not forbid website requests caused by a click or an observable DOM change. The absence of extension-initiated network calls does not mean “nothing can send data.” A website already controls its own page-accessible data.

A source review and tests cannot establish that an extension is exploit-free. Browser vulnerabilities, malicious updates, compromised accounts, source/package mismatches, incorrect rules, and browser/website behavior outside the fixtures remain risks. A checksum detects changes relative to a trusted copy; it does not establish trust on its own.

Before public distribution: obtain independent review, protect the publisher account with two-step verification, review the exact release diff and packaged bytes, keep the permission scope narrow, and complete accurate store/privacy disclosures. No Web Store package or third-party maintainer infrastructure has been certified safe by this project.
