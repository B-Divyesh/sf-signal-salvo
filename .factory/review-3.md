# Play a six-round tactics match — review 3

Date: 2026-09-06

## Verdict

**PASS — 0 findings and 0 untested public claims.**

## Reviewed revisions

- Static implementation candidate: `44821dfc3d2401fa00f02045fe0464e5aee931c5`.
- Room-service implementation: `db97f2af7c994394f6fd0b129c3340a031249a43`.
- Documentation revision reviewed: `90450706783f3668c17e98042a632b3776cd8189`.
- Live URL: https://signal-salvo.sociobot.in
- Commits after the implementation candidate change only `.factory` reports and handoff files.
- Live `index-uOke5bfi.js` SHA-256 is `227797d6dcb0fdf04d028c2f42be73d1662f5c495c426d9ed8c3a4fd899d40f7`; live `index-C_mU-rMT.css` is `f6fe275a5e1c71107b7095cb7148af7c59bd95ddc4a9c7e4081d8fa152f80de6`. Both exactly match the clean candidate build. Live `/health` reports the room-service implementation above.

## Job, audience, and first action

The job is to play a six-round tactics match. The audience is two friends on a call who want tactics without downloads, accounts, or twitch reflexes. The first action is **Try it with sample data**.

Fresh desktop (1440 × 900) and phone (390 × 844) contexts showed that wording, the primary action, and the live board before scrolling. Both started at `scrollY=0`, had 0 px horizontal overflow, and produced no console errors or failed responses.

## Live game and sample sandbox

- One click entered the sample. **Demo — sample data, nothing is saved** remained visible through play and the result.
- The deterministic phone run reached **You won the match**, 2 integrity to 0. The populated report recorded both sides landing pulses, a held position, a current shift, and the winner.
- The result title received focus. Its top was 79 px, safely below the 62.72 px sticky banner, and it was fully visible in the phone viewport.
- The live phone loop measured 60 fps, above the advertised 55 fps floor.
- **Play the sample again** and **Reset demo** each restored round 1 and `0 of 3` commands. A pre-existing real setting remained `{"sound":true,"motion":false}`; no real reconnect session appeared.
- Sample traffic used only `https://signal-salvo.sociobot.in`.
- Independent desktop and phone clients created and joined a live room. Player A locked a plan and reloaded into the same locked state. Player B still saw three empty command slots and no revealed action before locking.
- Both clients completed all six rounds and showed the same draw result with 4 integrity each. After a further 1.5 seconds, neither client had a console error or failed room response. Both reconnect sessions were cleared, and **Create a rematch** returned a different five-letter code.

## Clean checkout and claims

A new clone of documentation revision `9045070` installed the documented prerequisites with `npm ci`. `npm test` passed the production build, 4 frontend unit tests, 8 Rust tests, and 20 Chromium tests. `npm run build`, `cargo fmt --check --manifest-path server/Cargo.toml`, and `cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings` also passed.

Every exact command in `.factory/claims.json` was then run independently from that clean checkout and passed:

| Claim ID | Result |
| --- | --- |
| `sample-match-end` | PASS |
| `restart-reset` | PASS |
| `settings-persist` | PASS |
| `steady-frame-rate` | PASS |
| `online-match-duration` | PASS |
| `demo-private` | PASS |
| `online-network-private` | PASS |
| `no-personal-data-storage` | PASS |
| `request-log-privacy` | PASS |
| `online-two-player` | PASS |
| `room-reconnect` | PASS |
| `online-rematch` | PASS |
| `room-token-expiry` | PASS |
| `free-no-account` | PASS |
| `service-health` | PASS |
| `room-restart-persistence` | PASS |

The registry has 16 unique IDs and the test suite has exactly 16 unique `@claim:` tags, with no missing, duplicate, or unregistered tag. Public copy on the landing, demo, privacy, terms, metadata, and README was cross-checked against these outcomes. There are no unlisted public claims. No offline or update behavior is promised.

The clean build is 34.44 KB raw / 11.79 KB gzip JavaScript and 16.82 KB raw / 4.67 KB gzip CSS. It produces `dist/` and stays well below the first-load JavaScript budget.

## Accessibility, routes, privacy, and recovery

- `/opt/fleet/lib/verify-url.sh` passed live `/`, `/demo`, `/privacy`, and `/terms`: correct title, `lang=en`, one `h1`, a `main`, image alternatives, labelled buttons, and no console errors.
- Fresh live axe scans found zero serious or critical violations on `/`, `/demo`, `/privacy`, `/terms`, `/missing-page`, and `/404.html`.
- `/missing-page` deliberately returned HTTP 404 with the designed **Page not found — Signal Salvo** page, one `h1`, one `main`, and a route back. Its document-level 404 console line is expected and is not a defect.
- A real Tab press exposed **Skip to the game** with a 4 px ink outline and paired light/dark ring. Route changes focused the new heading; closing Settings returned focus to its opener.
- Reduced motion changed craft animation duration to `1e-05s`. At 200% text size the phone had 0 px horizontal overflow. All visible phone links, inputs, and buttons met the 44 px target minimum.
- Invalid room text produced direct five-letter recovery guidance. The clean browser scenario also passed incomplete and fourth-command boundaries, Enter activation, board arrow keys, a simulated connection failure and retry, and reload recovery.
- The privacy request mail link, legal pages, robots, sitemap, favicon, touch icon, social image, same-site links, and Param Factory link all resolved as expected.
- The sample made same-origin requests only. Live room creation contacted only the Signal Salvo site and its product-owned room service. No analytics, ads, external fonts, or third-party scripts appeared.
- Mobile Lighthouse scored 100 performance, 100 accessibility, 100 best practices, and 100 SEO. FCP was 1.0 s, LCP 1.1 s, TBT 0 ms, and CLS 0.

## Backend checks

- `/health` returned HTTP 200 with `ok: true` and build `db97f2af7c994394f6fd0b129c3340a031249a43`.
- A valid token from one new room received HTTP 401 against a second room.
- A concurrent 45-request check from a fresh identity returned 40 HTTP 200 responses and 5 HTTP 429 responses. The 429 response included `Retry-After: 10`; the same identity received HTTP 200 after the wait.
- The independently run restart-persistence claim started a real isolated Rust process with a fresh SQLite file, preserved an active room and locked plan across process restart, and completed the next resolution. The live service was not restarted because that would disrupt active rooms; its reported build is the exact tested server candidate.

## Earlier findings disposition

| Earlier finding | Current disposition |
| --- | --- |
| Late 410 after an online result | Closed. The fresh six-round live run had no failed room response or console error after the result and polling interval. |
| Privacy storage and log statements lacked outcome tests | Closed. Both are registered one-to-one claims and passed independently against isolated SQLite and captured logs. |
| Phone result title was hidden behind the sample banner | Closed. Fresh focus and geometry put the full title below the banner. |
| Focus indicator contrast was below 3:1 | Closed. The live paired focus treatment uses a 4 px ink outline on light surfaces and a light inner ring on dark surfaces; clean contrast assertions passed. |
| Metadata called commands “moves” | Closed. The live standard and Open Graph descriptions use **commands**. |
| README lacked a numeric session length | Closed. README states 2–4 minutes, and the declared duration test measured all six 18.5–20.1 second planning windows. |

All earlier minor checks remain closed: first-screen layout, sample isolation and reset, plan secrecy, reconnect, rematch, token expiry, movement alignment, keyboard operation, zoom, touch targets, route history, legal pages, SQLite durability, health, tenant isolation, and rate limiting were exercised again or covered by the fresh clean suite.

## Evidence and scope

Review evidence is in `/work/.evidence/signal-salvo-review-3/`, including first-screen captures, sample and multiplayer end screens, live results, URL-verifier output, focus capture, and Lighthouse JSON. The external evidence path named in the work order was not present in this disposable container; the full committed `.factory/verification-3.md` report was read, and all conclusions above use fresh primary evidence.

No product source, deployment, room-service configuration, or existing user data was changed. The abstract deterministic tactics game has no obvious missing AI-assisted step. There are no known gaps.
