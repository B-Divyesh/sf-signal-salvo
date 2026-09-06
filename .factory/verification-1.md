# Signal Salvo verification 1: browser game QA

Date: 2026-09-06

## Verdict

**FAIL** — 2 findings, including 2 untested public claims. All 13 declared claims passed, but this work order requires zero findings and zero untested public claims for PASS.

## Reviewed revisions

- Implementation candidate: `a16d0052ee9fce5c87775a819f9516d36d5fe28a`.
- Previous report and handoff revision: `291fb70219caeda78894ce56e7497e158f34192f`.
- The implementation differs from later documentation-only revisions. The live room-service `/health` response reports the implementation candidate SHA, and the live static asset hash matches the clean local build.
- Live URL: https://signal-salvo.sociobot.in

## Findings

1. **Low — a completed live online match writes an error to the browser console.** Two independent fresh browser contexts completed a room through the draw screen. After both result screens were visible, the browser reported `Failed to load resource: the server responded with a status of 410`. This comes from a scheduled room poll that races the intended reconnect-token expiry. The result UI remains usable, but a normal successful game path should stop or reconcile outstanding polls before its token is invalidated.
2. **Medium — two public privacy claims have no claim registry entry or observable claim test.** `/privacy` says that the service never stores names, email addresses, or account details, and that server logs contain request paths and status codes but not tokens or commands. Neither statement appears in `.factory/claims.json`; neither has the required one-command sandbox test. The claims contract requires such public claims to be tested or removed. The 13 existing entries all passed, so this is a registry-completeness finding rather than a failed declared command.

## First-screen and game evidence

Fresh desktop and 390 × 844 phone contexts loaded the live page before scrolling.

| Check | Desktop | Phone |
| --- | --- | --- |
| Job shown | “Play a six-round tactics match” | Same |
| Audience shown | Two friends on a call who want tactics without downloads, accounts, or twitch reflexes | Same |
| First action | “Try it with sample data” | Same |
| Playable board on first screen | Yes | Yes |
| Horizontal overflow | 0 px | 0 px |
| Console errors on initial load | 0 | 0 |

The live demo entered in one click, retained the persistent “Demo — sample data, nothing is saved” label through its actual win screen, and measured 59 fps in the 390 × 844 browser run. “Play the sample again” returned it to round 1 with an empty queue and preserved the pre-existing real settings value. Evidence images are in ignored local QA storage at `.factory/evidence/verification-1/`: `live-desktop-first-screen.png`, `live-phone-first-screen.png`, and `live-sample-end-screen.png`.

Two fresh live browser contexts created and joined a room, proved the first locked plan hidden after reload (three empty opponent queue slots and no command log leak), completed six rounds to draw screens, cleared both reconnect sessions, and created a different rematch room. Evidence images: `live-online-player-a-end.png` and `live-online-player-b-end.png`. The expired-token console error above was the only error recorded on that full successful online path.

## Declared claims from a clean checkout

Documented prerequisites were installed with `npm ci`. `npm test` passed: production build, 4 frontend unit tests, 8 Rust tests, and 16 Chromium tests. Each exact command listed in `.factory/claims.json` was then run independently; all passed.

| Claim ID | Result |
| --- | --- |
| `sample-match-end` | PASS |
| `restart-reset` | PASS |
| `settings-persist` | PASS |
| `steady-frame-rate` | PASS |
| `demo-private` | PASS |
| `online-network-private` | PASS |
| `online-two-player` | PASS |
| `room-reconnect` | PASS |
| `online-rematch` | PASS |
| `room-token-expiry` | PASS |
| `free-no-account` | PASS |
| `service-health` | PASS |
| `room-restart-persistence` | PASS |

The individual-command log is `/tmp/signal-salvo-claim-commands.log` in this QA container. It records all 13 zero exit statuses. `npm run build`, `cargo fmt --check --manifest-path server/Cargo.toml`, and `cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings` also passed. The build produced `dist/` with 11.50 KB gzip JavaScript and 4.64 KB gzip CSS.

## Live backend evidence

- `/health`: HTTP 200; `ok: true`; build SHA equals `a16d0052ee9fce5c87775a819f9516d36d5fe28a`.
- Tenant isolation: a valid token for one newly created room returned HTTP 401 against a second room.
- Request allowance: after two setup requests and 38 further requests from one test client identity, the next requests returned HTTP 429 with `Retry-After: 10`. This agrees with the 40-per-10-second implementation allowance.
- Restart persistence: the declared clean-checkout claim passed by creating a room, locking a real plan, terminating and starting the isolated Rust service on the same SQLite database, restoring the locked state, and completing the round. A live service restart was not initiated by this verification because the work order has no deployment action; the live service is the verified `a16d005` build and the earlier report records the durable-mount restart outcome.

## Accessibility, routes, privacy, and recovery

- Live Playwright axe scans found zero serious or critical violations on `/`, `/demo`, `/privacy`, `/terms`, and `/missing-page`.
- Each of those routes had `lang="en"`, exactly one `h1`, one `main`, and its expected title. Initial loads on the first four routes had no console errors.
- `/missing-page` returned the expected HTTP 404 and a designed page with a route back. Its browser network console message is the expected document-level 404, not a broken page.
- `/robots.txt`, `/sitemap.xml`, social image, favicon, internal links, and the Param Factory external link returned expected responses. Privacy and terms pages loaded and their mail links were present.
- Local browser coverage passed invalid room code, disconnected room service recovery, command limits, keyboard enter and board arrow controls, dialog focus return, reduced motion, 200% text, and 44 px phone targets.
- Demo traffic stayed on the product origin. Online traffic was limited to the static product origin and the product-owned room service in the declared test. No offline or update promise is made, so no unsupported offline claim was credited.

## Earlier findings and verification dispositions

The prior handoff’s listed fixes were inspected rather than assumed closed.

| Earlier item | Current disposition and evidence |
| --- | --- |
| Plain first-screen wording; persistent sample state; reset and real-setting preservation | Verified live on desktop and phone, including the demo win and reset. |
| Plan secrecy, reconnect, rematch, expiry, isolation, stale-plan recovery | Declared local claims passed; live two-client run verified secrecy after reload, completion, session clearing, and rematch. |
| Client/server movement alignment | 4 deterministic frontend and 8 backend tests passed, including the current-movement backend test. |
| Deep links, titles, 404, legal routes, metadata assets, links | Verified live route titles and statuses; deliberate 404 classified as expected. |
| Phone bounds, touch size, keyboard focus, zoom, reduced motion, contrast | Browser tests passed; live phone had no horizontal overflow; axe found no serious or critical issue. |
| Mounted-SQLite locking and restart persistence | Candidate health SHA is live; the clean isolated-service restart claim passed. The existing live restart evidence remains documented in the prior handoff. |

The two findings above remain open, so none of these prior dispositions changes the FAIL verdict.

## Scope and next step

No product source, deployment, or product data was changed. To reach PASS, add sandbox tests and registry entries for the two privacy promises (or remove them), then prevent the expected final-token expiry from surfacing as a browser console error after a completed match. Re-run this verification against the repaired implementation.
