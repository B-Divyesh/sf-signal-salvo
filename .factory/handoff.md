# Play a six-round tactics match — review 2 handoff

Date: 2026-09-06

## Outcome

Review 2 is **FAIL with 4 findings and 0 untested claims**. The full report is `.factory/review-2.md`.

The job is to play a six-round two-player tactics match. It is for two friends on a call. The first action is **Try it with sample data**.

## Revisions

- Implementation reviewed: `db97f2af7c994394f6fd0b129c3340a031249a43`.
- Documentation revision at review start: `970c0ec751135287eb2eb2d60154d0ce9cb814de`.
- Live URL: https://signal-salvo.sociobot.in
- Live static asset hashes and `/health` match the implementation candidate.

## Open findings

1. Medium: after the phone sample ends, the result heading and score remain above the viewport and behind the sticky sample bar; focus stays on the document body.
2. Medium: the global yellow focus outline has 1.58:1 contrast against the paper background, below the required 3:1.
3. Low: metadata says **moves**, while the interface and terminology record use **commands**.
4. Low: the README describes a “short call” but does not give the numeric session length required for browser games.

## Verification summary

- A clean clone at `970c0ec` passed `npm ci`, `npm test`, `npm run build`, Rust formatting, and clippy. The suite has 4 frontend tests, 8 backend tests, and 18 browser tests.
- All 15 exact claim commands passed independently. Registry IDs and test tags are complete and one-to-one.
- Fresh desktop and phone sample runs reached **You won the match** after three rounds. The sample label persisted, reset worked, real settings were unchanged, no real session was created, and the phone measured 60 fps.
- Independent desktop and phone clients kept plans hidden, recovered a reload, completed six online rounds, cleared sessions, and created a fresh rematch. No post-result request or console error occurred.
- Live health, tenant isolation, 429 with `Retry-After: 10`, final token expiry, routes, legal pages, links, privacy paths, and the designed 404 passed.
- Live axe found no serious or critical violations. URL verification passed all four public 200 routes. Mobile Lighthouse scored 100 in all four categories with 1.1 s LCP, 0 CLS, and 80 ms TBT.

## Run and verify

```bash
npm ci
npm test
npm run build
cargo fmt --check --manifest-path server/Cargo.toml
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
```

Every individual claim command is listed in `.factory/claims.json`.

## Evidence and next steps

Evidence is in `/work/.evidence/review-2/`. The report is also copied to `/work/.evidence/qa-report.md`, and the matching machine result is `/work/.evidence/qa-result.json`.

Address all four findings, add regression coverage for phone result visibility and focus contrast, then run a fresh review. No product code or deployment was changed during this review.
