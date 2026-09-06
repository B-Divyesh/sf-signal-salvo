# Play a six-round tactics match — verification 3 handoff

Date: 2026-09-06

## Outcome

Independent QA is **PASS — 0 findings and 0 untested public claims**. Signal Salvo lets two friends on a call play a six-round simultaneous tactics match. The first action is **Try it with sample data**.

## Reviewed revisions

- Static implementation: `44821dfc3d2401fa00f02045fe0464e5aee931c5`.
- Documentation record: `02c0607749d5f972e4c4b81841f96db8814d483a`.
- Current documentation-only head: `8576547aa4cdd503d8c4ecab4601d1c9964e85c8`.
- Room-service implementation: `db97f2af7c994394f6fd0b129c3340a031249a43`.
- Live static assets exactly match a clean build of the static implementation. Live `/health` reports the room-service build above.

## What was verified

- Fresh desktop and phone pages showed the job, audience, first action, and game board before scrolling with no overflow or console errors.
- The one-click sandbox retained **Demo — sample data, nothing is saved**, reached **You won the match** with populated output, focused the phone result below the demo bar, reset to round 1 and `0 of 3`, and did not alter real settings or create a real session.
- Two independent live clients created, joined, reloaded, preserved plan secrecy, completed six rounds, cleared reconnect sessions, and created a distinct rematch.
- Live health, tenant isolation (401), and rate allowance (429 with `Retry-After: 10` on request 41) passed. Isolated SQLite testing proved restart persistence without disrupting the live service.
- A clean clone passed `npm ci`, `npm test`, `npm run build`, Rust formatting, and Rust clippy. It ran 4 unit tests, 8 Rust tests, and 20 Chromium tests.
- Every one of the 16 exact commands in `.factory/claims.json` passed independently, including the 2–4 minute / six 20-second-window duration claim.
- Live URL verification and axe scans passed for the landing, demo, legal pages, and designed 404. Keyboard, focus contrast, reduced motion, text zoom, touch targets, invalid input, boundaries, and recovery passed browser coverage.

## How to run and verify

```bash
npm ci
npm test
npm run build
cargo fmt --check --manifest-path server/Cargo.toml
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
```

Open `/demo` or select **Try it with sample data**. Choose **Queue sample plan**, then **Lock three commands**, until the end screen. For an online game, select **Create a room** and have the friend open the shared five-letter room code.

## Evidence and known gaps

The full report is `.factory/verification-3.md`; live URL-verifier evidence is `/work/.evidence/signal-salvo-verification-3/`. There are no known product gaps. No offline or update behavior is promised. No AI feature is appropriate for this deterministic tactics game.
