# Signal Salvo verification 2: browser game QA

Date: 2026-09-06

## Verdict

**PASS** — 0 findings and 0 untested public claims.

## Reviewed revisions

- Implementation candidate: `db97f2af7c994394f6fd0b129c3340a031249a43`.
- Documentation revision at review start: `8391a1bb222d6e6e9edfefac805549eff8b43c69`.
- Verification documentation report commit: `26c059603bfd20445ff00c41a4ffd1df8d023e6a`.
- Live URL: https://signal-salvo.sociobot.in
- The live static JavaScript and CSS SHA-256 values exactly matched a clean local build of the reviewed candidate. Live `/health` returned HTTP 200 with this implementation SHA.

## Job, audience, and first action

Signal Salvo lets two friends on a call play a short, simultaneous-planning tactics game without an account or download. The first action is **Try it with sample data**, which starts the fixed sample opponent.

Fresh desktop (1440 × 900) and phone (390 × 844) browser contexts showed that job, audience, action, and playable board before scrolling. The phone page had 0 px horizontal overflow and no initial console errors. Screenshots are in `/work/.evidence/verification-2/`.

## Game and demo evidence

- The fresh live sample used the persistent label **“Demo — sample data, nothing is saved”**, reached an actual end screen after three resolved rounds, and retained the label at the result.
- **Play the sample again** returned to round 1 with `0 of 3` commands. The sample made requests only to the static product origin; no room-service call or real data write was observed.
- Live phone measurement was 60.00 fps after 2.2 seconds, exceeding the advertised 55 fps floor.
- Two independent fresh live clients created and joined a five-letter room, completed six rounds to draw end screens, and then waited 1.6 seconds beyond completion. There were zero console errors, zero failed room responses, and both reconnect sessions were cleared. This directly rechecks the prior completed-match polling race.

## Claims and clean checkout

A fresh clone at the review documentation revision was installed with `npm ci`. `npm test` passed: production build, 4 frontend unit tests, 8 Rust tests, and the Chromium suite (`test-results/.last-run.json` recorded `passed`). `npm run build`, `cargo fmt --check --manifest-path server/Cargo.toml`, and `cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings` passed. The built client was 34.13 KB raw / 11.70 KB gzip JavaScript and 16.73 KB raw / 4.64 KB gzip CSS.

Every exact command in `.factory/claims.json` was run independently and passed. The registry has 15 claims and 15 test tags, each with exactly one matching tag; no claim test tag is unregistered.

| Claim ID | Result |
| --- | --- |
| `sample-match-end` | PASS |
| `restart-reset` | PASS |
| `settings-persist` | PASS |
| `steady-frame-rate` | PASS |
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

The two privacy statements added after verification 1 have outcome tests against an isolated Rust/SQLite service and captured service logs. Their independent claim commands passed.

## Accessibility, routes, and recovery

- `/`, `/demo`, `/privacy`, `/terms`, `/missing-page`, and `/404.html` had their expected route titles, exactly one `h1`, and one `main`. Playwright axe found zero serious or critical violations on each route.
- The supplied `verify-url.sh` passed `/`, `/demo`, `/privacy`, and `/terms`: `lang=en`, title, main landmark, no missing image alternatives, no unlabelled buttons, and zero console errors.
- Live reduced-motion styling set the craft animation to `1e-05s`; the visible keyboard focus ring was solid and 4 px. Phone overflow remained 0 px.
- Local browser coverage passed invalid room code, service-disconnect recovery, command boundaries, keyboard command and arrow controls, dialog focus return, 200% text, and 44 px touch targets.
- The designed `/missing-page` document deliberately returns HTTP 404 and supplies a route back. This is expected, not a defect. `robots.txt`, `sitemap.xml`, legal routes, assets, same-site links, the external factory link, and the explicit privacy mail link were checked.
- No offline or update promise is made, so none was credited as a claim.

## Live backend evidence

- `/health`: HTTP 200, `ok: true`, implementation SHA `db97f2a…`.
- Tenant isolation: a valid token for one fresh room returned HTTP 401 against another fresh room.
- Request allowance: a fresh valid room reached HTTP 429 with `Retry-After: 10` during a 45-request check.
- The independently executed `room-restart-persistence` claim created a real isolated service and SQLite database, locked a plan, restarted the service on the same database, restored that lock, and completed the round. A live restart was not initiated during read-only deployment QA.

## Earlier findings disposition

| Earlier finding | Disposition |
| --- | --- |
| Completed online match could emit a late 410 console error | Closed. The direct live two-client run completed and observed beyond the polling interval with zero failed room responses and zero console errors. |
| Privacy statements lacked claim entries and outcome tests | Closed. Both statements now have a registry entry, exactly one tagged test, and passed independently from a clean checkout. |
| Earlier minor review items: sample isolation, reset, persistence, secrecy, reconnects, rematches, expiry, movement, accessibility, route metadata, legal pages, SQLite durability, and rate limiting | Remain closed. The applicable local claim tests and live checks above passed. |

## Evidence and scope

Evidence screenshots and URL-verifier output are in `/work/.evidence/verification-2/`; exact individual-claim command output is `/tmp/signal-salvo-verify2-claims.log` in this verification container. No product source, deployment, or product data was changed. There are no known remaining defects in the admitted scope.
