# Play a six-round tactics match — review 3 handoff

Date: 2026-09-06

## Outcome

Strict review 3 is **PASS — 0 findings and 0 untested public claims**. Signal Salvo lets two friends on a call complete a simultaneous six-round tactics match. The first action is **Try it with sample data**.

## Reviewed revisions

- Static implementation: `44821dfc3d2401fa00f02045fe0464e5aee931c5`.
- Room-service implementation: `db97f2af7c994394f6fd0b129c3340a031249a43`.
- Documentation baseline: `90450706783f3668c17e98042a632b3776cd8189`.
- Live static asset hashes match the clean candidate build. Live `/health` reports the room-service implementation above.

## What was verified

- Fresh desktop and phone pages showed the job, audience, sample action, and board before scrolling without overflow or console errors.
- The isolated one-click sample kept its label, reached a visible 2–0 win with a populated report at 60 fps, focused the result below the phone banner, reset correctly, and preserved real settings.
- Independent live desktop and phone clients kept plans secret, recovered a locked plan after reload, completed six rounds to matching draw screens, cleared reconnect sessions, and created a distinct rematch.
- The live service passed health, cross-room isolation, the 40-request allowance, HTTP 429 with `Retry-After: 10`, and recovery after the wait. The isolated SQLite claim passed a real process restart.
- A clean checkout passed `npm test`, the production build, Rust formatting, and clippy. All 16 exact claim commands passed independently, with one registered tag per claim.
- Live URL verification, axe, keyboard and focus behavior, reduced motion, 200% text, 44 px phone targets, invalid input, boundary and recovery paths, legal pages, links, and the designed 404 passed.
- Mobile Lighthouse scored 100 in performance, accessibility, best practices, and SEO; LCP was 1.1 s and CLS was 0.

## How to run and verify

```bash
npm ci
npm test
npm run build
cargo fmt --check --manifest-path server/Cargo.toml
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
```

Open `/demo` or select **Try it with sample data**. Select **Queue sample plan**, then **Lock three commands**, until the result. For online play, create a room and have the other player join with its five-letter code.

## Evidence and known gaps

The full report is `.factory/review-3.md`. Fresh evidence is in `/work/.evidence/signal-salvo-review-3/`. No product code or deployment was changed. No offline or update behavior is promised. No AI feature is appropriate for this deterministic tactics game. There are no known gaps.
