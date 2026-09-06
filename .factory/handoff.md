# Play a short two-player tactics match — review 1 handoff

Date: 2026-09-06

## Outcome

Review 1 is **PASS with 0 findings and 0 untested claims**. The complete report is `.factory/review-1.md`.

The job is to play a short two-player tactics match. It is for two friends on a call. The first action is **Try it with sample data**.

## Revisions

- Implementation reviewed: `db97f2af7c994394f6fd0b129c3340a031249a43`.
- Documentation revision reviewed: `85522e6d610f89ceb69b881fb992f556eff06533`.
- Live URL: https://signal-salvo.sociobot.in
- The live static assets match the clean candidate build, and live `/health` reports the candidate SHA.

## Verification summary

- A clean clone installed with `npm ci` and passed `npm test`: build, 4 frontend tests, 8 Rust tests, and 18 Chromium tests.
- All 15 declared claim commands passed separately. The registry and test tags are complete and one-to-one.
- Fresh desktop and phone browsers showed the job, audience, first action, and board before scrolling.
- The sample reached **You won the match**, retained its sample label, reset to round 1, preserved real settings, used only the static site origin, and measured 59.94 fps on the phone.
- Two independent live clients kept plans private, reconnected, completed six rounds to matching draw screens, cleared their sessions, and created a different rematch room. No failed room response or console error appeared after completion.
- Live axe scans, the supplied URL verifier, keyboard/focus, reduced motion, 200% text, 44 px targets, route titles, legal pages, links, security headers, and the designed 404 passed.
- Mobile Lighthouse scored 100 in performance, accessibility, best practices, and SEO. FCP was 0.9 s, LCP 1.2 s, CLS 0, and TBT 80 ms.
- Live health, tenant isolation, and 429 with `Retry-After: 10` passed. The isolated real-service restart test proved SQLite persistence.
- Both verification-1 findings remain closed: the post-match 410 did not recur, and both privacy statements have passing outcome tests.

## Run and verify

```bash
npm ci
npm test
npm run build
cargo fmt --check --manifest-path server/Cargo.toml
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
```

Every individual public claim command is listed in `.factory/claims.json`.

## Evidence and remaining work

Review evidence is in `/work/.evidence/review-1/`. The report is also copied to `/work/.evidence/qa-report.md`, and the machine result is `/work/.evidence/qa-result.json`.

No product source or deployment was changed. There are no known defects in the admitted scope. SQLite remains intended for one realtime replica on the product's durable `/data` mount; do not scale beyond one replica without changing the state store.
