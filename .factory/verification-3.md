# Play a six-round tactics match — verification 3

Date: 2026-09-06

## Verdict

**PASS — 0 findings and 0 untested public claims.**

## Reviewed revisions

- Implementation candidate: `44821dfc3d2401fa00f02045fe0464e5aee931c5`.
- Documentation revision: `02c0607749d5f972e4c4b81841f96db8814d483a`.
- Checkout head: `8576547aa4cdd503d8c4ecab4601d1c9964e85c8` (handoff-only revision).
- Live URL: https://signal-salvo.sociobot.in
- The live static assets were exactly the clean candidate build: `index-uOke5bfi.js` SHA-256 `227797d6dcb0fdf04d028c2f42be73d1662f5c495c426d9ed8c3a4fd899d40f7` and `index-C_mU-rMT.css` SHA-256 `f6fe275a5e1c71107b7095cb7148af7c59bd95ddc4a9c7e4081d8fa152f80de6`.
- Live room-service health reported the unchanged service build `db97f2af7c994394f6fd0b129c3340a031249a43`.

## Job, audience, and first action

The job is to play a six-round tactics match. The audience is two friends on a call. The first action is **Try it with sample data**.

Fresh desktop (1440 × 900) and phone (390 × 844) contexts showed that wording, the action, and the playable board before scrolling. Both had 0 px horizontal overflow and no initial console errors.

## Live game and sample sandbox

- One click entered the sample. The persistent label **Demo — sample data, nothing is saved** stayed visible through active play and the result.
- The deterministic phone sample reached **You won the match** with integrity 2–0. Its populated round report included pulse hits, a held position, a current shift, and the winner.
- The repaired result presentation focused `#end-title`; its top was 79 px, above the 62.72 px sticky demo bar plus the required gap. The title was fully in the phone viewport.
- The live phone loop measured 59.37 fps. This exceeds the advertised 55 fps floor.
- **Play the sample again** returned the board to round 1 and `0 of 3` commands. A pre-existing real settings value remained `{"sound":true,"motion":false}`; no real session was created. Sample requests used only `https://signal-salvo.sociobot.in`.
- Independent desktop and phone clients created and joined a room. Player A locked a plan, reloaded, and recovered the locked state. Player B saw three empty opponent slots before resolving, so no plan was revealed early. Both completed all six rounds to matching draw screens (4 integrity each), with no console errors or failed room responses after a further 1.4 seconds. Both reconnect sessions cleared and **Create a rematch** returned a different five-letter code.

## Clean checkout and claims

A new clone at `8576547` installed the documented prerequisites with `npm ci`. It passed `npm test` (production build, 4 frontend unit tests, 8 Rust tests, and 20 Chromium tests), `npm run build`, `cargo fmt --check --manifest-path server/Cargo.toml`, and `cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings`.

All 16 exact commands from `.factory/claims.json` were run independently and passed. The registry has 16 IDs, each appears in exactly one `@claim:` tag, and no tag is unregistered.

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

The tested duration claim verifies six 18.5–20.1 second planning windows and the README accurately says 2–4 minutes. The clean build is 34.44 KB raw / 11.79 KB gzip JavaScript and 16.82 KB raw / 4.67 KB gzip CSS.

## Accessibility, routes, privacy, and recovery

- `/opt/fleet/lib/verify-url.sh` passed live `/`, `/demo`, `/privacy`, and `/terms`: correct route title, `lang=en`, exactly one `h1`, a `main`, image alternatives, labelled buttons, and no console errors.
- Live axe scans found zero serious or critical violations on `/`, `/demo`, `/privacy`, `/terms`, `/missing-page`, and `/404.html`.
- The repaired paired focus treatment has a visible 4 px focus ring. The clean browser checks passed its computed contrast on light and dark surfaces, keyboard commands and board arrows, dialog focus return, reduced motion, 200% text, and 44 px phone targets.
- The normal, invalid, boundary, and recovery browser scenario passed: invalid room-code guidance, blocked incomplete/fourth commands, keyboard activation, a disconnected service recovery, and reload recovery.
- Route titles and history pass. The privacy request mail link, legal pages, robots, sitemap, favicon, touch icon, social image, internal links, and the Param Factory link all passed the clean suite. `/missing-page` is an intentional HTTP 404 with the designed page and return route, not a defect.
- No offline or update promise is made, so neither was counted as a claim. The full privacy claims are now listed and tested, including isolated SQLite storage, log redaction, separate demo storage, same-origin sample traffic, and product-owned online traffic.

## Backend checks

- `/health` returned healthy status and the service build above.
- A valid token for one new room received HTTP 401 against a second room.
- A fresh request identity first received HTTP 429 on request 41, with `Retry-After: 10`.
- The independently run restart-persistence claim used a real isolated Rust process and SQLite file, preserved a locked plan across restart, and completed the next resolution. The live service was not restarted because that would disrupt active rooms.

## Earlier findings disposition

| Earlier finding | Current disposition |
| --- | --- |
| Late 410 after an online result | Closed: fresh live two-client completion had no failed room response or console error after polling time. |
| Privacy storage and request-log promises lacked outcome tests | Closed: both are registered one-to-one claims and passed independently against isolated services. |
| Phone result title was behind the demo bar | Closed: fresh phone result focus and geometry are unobscured. |
| Focus ring contrast was below 3:1 | Closed: clean browser contrast assertions and live ring inspection pass. |
| Metadata used “moves” | Closed: standard and Open Graph descriptions now use “commands.” |
| README lacked a numeric duration | Closed: README states 2–4 minutes and the six 20-second-window claim passes. |

## Evidence and scope

Live URL-verifier screenshots and JSON are in `/work/.evidence/signal-salvo-verification-3/`. This verification changed no product source, deployment, room-service configuration, or user data. No known gaps remain.
