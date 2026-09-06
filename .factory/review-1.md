# Play a short two-player tactics match — review 1

Date: 2026-09-06

## Verdict

**PASS — 0 findings and 0 untested claims.**

## Reviewed revisions

- Implementation candidate: `db97f2af7c994394f6fd0b129c3340a031249a43`.
- Documentation revision reviewed: `85522e6d610f89ceb69b881fb992f556eff06533`.
- Live URL: https://signal-salvo.sociobot.in
- The later commits contain reports only. There is no product-file difference between the implementation candidate and the documentation revision.
- The live JavaScript and CSS SHA-256 values match a clean build of the candidate. Live `/health` reports the same implementation SHA.

## Job, audience, and first action

The job is to play a short two-player tactics match. The audience is two friends on a call who want tactics without an account, download, or twitch reflexes. The first action is **Try it with sample data**.

Fresh 1440×900 desktop and 390×844 phone contexts showed the job, audience, first action, and playable board before scrolling. Both had zero horizontal overflow and zero initial console errors.

## Sample and game run

- The first action opened `/demo` in one click.
- The persistent label said **Demo — sample data, nothing is saved** through active play and the end screen.
- The fixed sample reached **You won the match** after three resolved rounds.
- **Play the sample again** and **Reset demo** each returned the game to round 1 with `0 of 3` commands.
- A real settings value placed before entry remained unchanged after sample play and reset. Sample traffic stayed on the static product origin, and no real room session was created.
- The phone run measured 59.94 frames per second, above the stated 55 fps floor.
- Settings, sound controls, motion controls, command boundaries, mouse/touch use, Enter activation, board arrow keys, and restart behavior worked.

Two independent fresh live clients created and joined a five-letter room. Player A locked a plan and reloaded. Player A recovered the locked state, while player B still saw three empty opponent slots and no opponent command log. Both clients completed six rounds and reached matching draw screens. After 1.8 seconds beyond completion, there were zero failed room responses and zero console errors. Both reconnect sessions were cleared, and **Create a rematch** produced a different room code.

Screenshots and machine-readable live results are in `/work/.evidence/review-1/`.

## Claims from a clean checkout

A clean clone of documentation revision `85522e6` was installed with `npm ci`. `npm test` passed: the production build, 4 frontend unit tests, 8 Rust tests, and 18 Chromium tests. Every exact command declared in `.factory/claims.json` then passed separately.

| Claim | Result |
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

The registry contains 15 claims. Each ID has exactly one matching test tag, and there are no unregistered tags. Landing, game, privacy, terms, and README statements were cross-checked against the registry and observable tests. No unsupported public claim was found.

`npm run build` produced `dist/`. JavaScript is 34.13 KB raw / 11.70 KB gzip. CSS is 16.73 KB raw / 4.64 KB gzip. `cargo fmt --check --manifest-path server/Cargo.toml` and `cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings` passed.

## Accessibility, routes, privacy, and recovery

- `/`, `/demo`, `/privacy`, `/terms`, `/missing-page`, and `/404.html` had the expected unique title, `lang="en"`, one `h1`, one `main`, and zero serious or critical axe findings.
- `/opt/fleet/lib/verify-url.sh` passed `/`, `/demo`, `/privacy`, and `/terms` with no console errors, missing image alternatives, or unnamed buttons.
- The designed `/missing-page` response returned HTTP 404 and a working route back. This deliberate status is expected.
- Keyboard focus was visible with a solid 4 px outline. Dialog focus returned to Settings. Reduced motion changed craft animation duration to `1e-05s`. The phone had no target smaller than 44 px, and 200% text caused no horizontal overflow.
- Invalid numeric and missing room codes produced direct recovery text. Empty and incomplete plans could not be locked. A simulated connection failure and reload recovery passed in the clean suite.
- The privacy and terms pages loaded. The privacy request mail link was present. Sample requests were same-origin; online requests were limited to the site and product-owned room service. No analytics, ad, external font, or third-party script request appeared.
- `robots.txt`, `sitemap.xml`, favicon, touch icon, social image, internal links, and the Param Factory link returned expected responses.
- Security headers included CSP, frame protection, content-type protection, referrer policy, permissions policy, and cross-origin opener policy.
- No offline or update behavior is promised, so neither was recorded as a passed claim.

Live mobile Lighthouse scored 100 performance, 100 accessibility, 100 best practices, and 100 SEO. FCP was 0.9 s, LCP 1.2 s, CLS 0, and TBT 80 ms.

## Backend checks

- `/health`: HTTP 200, `ok: true`, build SHA `db97f2af7c994394f6fd0b129c3340a031249a43`.
- Tenant isolation: a valid player token from one new room returned HTTP 401 against a second room.
- Request allowance: a fresh client reached HTTP 429 and received `Retry-After: 10`.
- Restart persistence: the separate clean-checkout claim created a real isolated Rust service and SQLite file, locked a plan, restarted the service on the same file, restored the lock, and completed the round. The live service was not restarted because this review has no deployment action.
- Privacy storage and logging: isolated service tests verified that submitted personal markers were absent from SQLite and responses, while logs retained paths and statuses but omitted tokens and command bodies.

## Earlier finding disposition

| Earlier item | Current evidence |
| --- | --- |
| Late HTTP 410 after a completed online match | Closed. The fresh live two-client run waited beyond polling and had zero failed responses and console errors. |
| Untested personal-data storage statement | Closed. The declared isolated SQLite outcome test passed independently. |
| Untested request-log privacy statement | Closed. The declared captured-log outcome test passed independently. |
| First-screen wording, board visibility, phone layout, and sample action | Remain closed through fresh desktop and phone checks before scrolling. |
| Sample label, isolation, reset, and real-setting preservation | Remain closed through the fresh live sample run and separate claim commands. |
| Plan secrecy, reconnect, rematch, token expiry, and stale-plan recovery | Remain closed through the live room and clean tests. |
| Client/server movement alignment and deterministic ending | Remain closed through frontend and backend tests plus the live sample win. |
| Keyboard, focus, reduced motion, text zoom, touch targets, and contrast | Remain closed through live checks, axe, URL verification, and Lighthouse. |
| Route titles, history behavior, metadata, legal pages, links, and designed 404 | Remain closed through fresh live route and link checks. |
| SQLite durability, tenant isolation, health, and rate limiting | Remain closed through the restart claim and live backend checks. |

## Scope and evidence

No product code, deployment, service configuration, or existing product data was changed. No AI feature is expected for this deterministic two-player game, and adding one would not improve the brief's main job.

Evidence:

- `/work/.evidence/review-1/live-results.json`
- `/work/.evidence/review-1/live-desktop-first-screen.png`
- `/work/.evidence/review-1/live-phone-first-screen.png`
- `/work/.evidence/review-1/live-sample-end-phone.png`
- `/work/.evidence/review-1/live-online-a-end.png`
- `/work/.evidence/review-1/live-online-b-end.png`
- `/work/.evidence/review-1/npm-test.log`
- `/work/.evidence/review-1/claim-commands.log`
- `/work/.evidence/review-1/claim-summary.tsv`
- `/work/.evidence/review-1/lighthouse.json`
- `/work/.evidence/review-1/asset-hashes.txt`

There are no known defects in the reviewed scope.
