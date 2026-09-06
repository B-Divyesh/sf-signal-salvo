# Play a six-round tactics match — repair 2 handoff

Date: 2026-09-06

## Outcome

All four review-2 findings are fixed. The job is to play a six-round simultaneous tactics match. It is for two friends on a call. The first action is **Try it with sample data**.

## Revisions and deployment

- Static implementation: `44821dfc3d2401fa00f02045fe0464e5aee931c5` (`Fix result feedback and focus contrast`).
- The room-service implementation remains `db97f2af7c994394f6fd0b129c3340a031249a43`; it was not changed or restarted.
- Static deployment: `2e998a80-e44d-4c65-8aaf-0167f2b667f1`.
- Live URL: https://signal-salvo.sociobot.in
- The live JavaScript and CSS SHA-256 values match the clean build of the static implementation. Live `/health` returns the unchanged room-service SHA above.

## Changes

1. Completing the sample now scrolls the final result below the sticky demo bar and moves focus to `#end-title`. The result heading has a scroll margin as a browser fallback.
2. Focus uses a paired ink-and-paper ring. Ink contrasts with light surfaces; paper contrasts with dark panels. The visual thesis records this treatment.
3. HTML and Open Graph descriptions now use **commands**, the product’s single public term.
4. README now states a 2–4 minute intended online match duration and its six 20-second planning windows. The corresponding numeric claim has an outcome test.

## Verification

From the documented clean setup, `npm ci`, `npm test`, `npm run build`, `cargo fmt --check --manifest-path server/Cargo.toml`, and `cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings` passed. The suite contains 4 frontend unit tests, 8 Rust tests, and 20 Chromium scenarios.

All 16 exact commands in `.factory/claims.json` passed separately. The registry and `@claim:` tags are one-to-one. The new `online-match-duration` test creates a real local room, observes six 18.5–20.1 second windows, and completes the six-round match.

Fresh live desktop (1440×900) and phone touch (390×844) contexts showed the job, audience, first action, and game preview before scrolling. Each entered the one-click sample, reached a populated win screen, kept **Demo — sample data, nothing is saved** visible, reset to round 1 with `0 of 3` commands, and left real settings and real-room storage unchanged. The phone result title was focused at 79 px, below the 62.72 px sticky demo bar, with no console errors or non-product requests.

Fresh independent desktop and phone clients created and joined a live room, kept the locked plan hidden, recovered a reload, completed six rounds to draw screens, cleared reconnect sessions, and created a different rematch. There were no console errors or failed room responses after the result.

Live backend checks passed: `/health` returned 200, a token from one room received 401 against another room, and a fresh client was limited at request 40 with `Retry-After: 10`. The declared isolated restart-persistence claim passed; the live service was intentionally not restarted.

`verify-url.sh` passed live `/`, `/demo`, `/privacy`, and `/terms` with titles, `lang`, one `h1`, one `main`, image alternatives, labelled controls, and zero console errors. Live axe scans found zero serious or critical issues on those routes and the designed HTTP 404. The deliberate `/missing-page` 404 is expected and has a working return route.

Final mobile Lighthouse: performance 100, accessibility 100, best practices 100, SEO 100; FCP 1.5 s, LCP 1.5 s, CLS 0, TBT 0 ms. Build output is 34.44 KB raw / 11.79 KB gzip JavaScript and 16.82 KB raw / 4.67 KB gzip CSS.

## Finding disposition

| Review item | Current evidence |
| --- | --- |
| Phone result heading behind the sample bar | Closed. Phone regression and fresh live run prove focused, unobscured result presentation. |
| Focus ring below 3:1 | Closed. Local computed-color regression and live two-color focus inspection prove the accessible ring. |
| Metadata said “moves” | Closed. Live standard and Open Graph descriptions say “commands.” |
| README lacked numeric duration | Closed. README names 2–4 minutes and the six 20-second windows; the quantitative claim passed independently. |
| Earlier final polling 410, privacy claims, demo isolation, room secrecy, reconnect, rematch, token expiry, routes, legal pages, SQLite persistence, and rate limiting | Remain closed through the full local suite and fresh live runs above. |

## Evidence and known gaps

Evidence is in `/work/.evidence/signal-salvo-repair-2/`: separate-claim output, live browser/sample, axe, online-room, backend, URL-verifier, and Lighthouse results. The catalog description is copied to `/work/.evidence/catalog-description.txt`.

No known product defects remain. No paid offer is advertised because the researched brief defines this product as free. No AI feature is appropriate for this deterministic tactics game. The room service was not restarted live to avoid disrupting active rooms; its durable SQLite restart behavior is covered by the declared isolated real-process claim.
