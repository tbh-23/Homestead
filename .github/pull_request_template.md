## What does this PR do?

A short description of the change.

## Related issue

Closes HAR-

## How was it tested?

- [ ] `npm test` passes (and `src/css/tailwind.css` is committed if it changed)
- [ ] Ran locally with at least one synthetic learner
- [ ] Verified the affected screen(s) work, on desktop and mobile widths if the layout changed
- [ ] No console errors

## Checklist

- [ ] Follows the existing code style (vanilla JS, `el()` helper, Tailwind, Lucide icons)
- [ ] No application framework/bundler added; generated assets are current
- [ ] No copy of the taxonomy dataset committed
- [ ] Curriculum attribution left intact
- [ ] No real names or `data/private/` contents committed
- [ ] User-facing text is in Australian English
- [ ] `npm run check` passes (fast security baseline, isolation, dead-code, and copy checks)
- [ ] Threat model (`docs/security/THREAT-MODEL.md`) updated if adding a route, stored field, external call, or secret
- [ ] If touching security-sensitive code (`server.mjs`, `store.js`, `document.js`, `pin.js`, `ai.js`, `redact.js`, `shell.js`, `firebase-backend.js`, `firestore.rules`, `storage.rules`, or auth E2E specs), completed an adversarial security review pass (hostile inputs, mutation checks, zero secret/PII leakage) and noted it above
