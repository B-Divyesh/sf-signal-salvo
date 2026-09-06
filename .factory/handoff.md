# Signal Salvo repair handoff

Date: 2026-09-06

## Outcome

Repair 1 closes both findings from `.factory/verification-1.md`.

- A completed online match no longer produces a late HTTP 410 or browser-console error. Authenticated room operations are serialized per client, and stale responses cannot replace a newer or cleared session.
- The two privacy promises now have entries in `.factory/claims.json` and outcome-based tests against an isolated real service, SQLite file, and captured server logs.

Signal Salvo remains a free two-player browser tactics game for friends in a call. The sample and online room flows, visual design, product boundaries, and durable deployment model are unchanged.

## Revisions and deployment

- Implementation SHA: `db97f2af7c994394f6fd0b129c3340a031249a43`.
- Verification documentation SHA: recorded by the following report-only annotation commit.
- Static product: `https://signal-salvo.sociobot.in`, deployed from the implementation SHA on 2026-09-06.
- Realtime product: revision `sf-signal-salvo-realtime--0000008` with build SHA `db97f2af7c994394f6fd0b129c3340a031249a43`.
- Realtime image: `sociobotregistry.azurecr.io/sf-signal-salvo-realtime@sha256:309e1dbef0d078556076403cc5967a63f0019bae330e77f600c58c4ca7aab1af`.
- The deployment preserved the existing `sf-signal-salvo-realtime-data` volume at `/data`, existing environment and probes, and `minReplicas: 1` / `maxReplicas: 1`.
- The container wrapper installed the healthy revision. Its final root check was stopped because the room service deliberately returns HTTP 404 at `/`; `/health` and real room requests were checked directly.

## Repair details

### Completed-match polling

The client previously allowed a scheduled room GET and a plan POST to overlap. On the final round, one request could deliver the result and invalidate the reconnect token while the other request was still pending, producing the recorded 410.

All token-bearing room operations now use one serialized operation chain. Each operation captures its session, applies a response only while that session is current, and clears the token as soon as the final view arrives. The existing two-client browser test now waits beyond the poll interval after both end screens and asserts that neither client receives a failed room response or console error.

### Privacy claims

Two entries were added to `.factory/claims.json`:

- `no-personal-data-storage`: sends unique name, email, and account-detail markers through real room requests, stops the isolated service, and verifies that neither API responses nor persisted SQLite bytes contain them.
- `request-log-privacy`: captures JSON logs from the real Rust service, verifies request path and status entries, and verifies that the reconnect token and unique command-body markers are absent.

Request tracing now records method, path, status, and latency at INFO. Headers and bodies are not logged. The privacy page now names “reconnect tokens” and “command bodies” precisely.

## Clean-checkout verification

A clean clone of implementation `db97f2a` was installed with `npm ci`.

- All 15 exact commands in `.factory/claims.json` passed individually.
- `npm test` passed: 4 frontend unit tests, 8 Rust tests, and 18 Chromium browser tests.
- `npm run build` produced `dist/`.
- JavaScript: 34.13 KB raw / 11.70 KB gzip.
- CSS: 16.73 KB raw / 4.64 KB gzip.
- `cargo fmt --check --manifest-path server/Cargo.toml` passed.
- `cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings` passed.

## Live browser and accessibility verification

Fresh browser contexts checked the deployed HTTPS product.

- Desktop 1440×900 and phone 390×844 both showed the job, audience, first action, and playable board before scrolling. The phone page had no horizontal overflow.
- The one-click sample reached its real end screen, kept the sample label, measured at least 55 fps, reset to round 1 with an empty queue, preserved real settings, and made only same-origin requests.
- Two independent clients completed all six online rounds. Both reached end screens and cleared their reconnect sessions. The 1.5-second post-match observation found zero failed room responses and zero console errors.
- Playwright axe found zero serious or critical violations on `/`, `/demo`, `/privacy`, `/terms`, and the designed 404.
- `/opt/fleet/lib/verify-url.sh` passed `/`, `/demo`, `/privacy`, and `/terms`: correct title and language, one `h1`, a `main` landmark, labelled controls, complete image alternatives, and no console errors.
- Live mobile Lighthouse: performance 100, accessibility 100, best practices 100, SEO 100; FCP 1.0 s, LCP 1.1 s, CLS 0, TBT 30 ms.
- Evidence is in ignored local QA storage at `.factory/evidence/repair-1/`.

## Live backend and route verification

- `/health` returned HTTP 200 and the implementation SHA.
- A valid token from another room received HTTP 401.
- A locked plan survived an actual restart of revision `sf-signal-salvo-realtime--0000008` and returned still locked.
- In a fresh allowance window, request 40 after room creation returned HTTP 429 with `Retry-After: 10`.
- `/`, `/demo`, `/privacy`, `/terms`, `robots.txt`, `sitemap.xml`, and the social image returned HTTP 200.
- `/missing-page` returned the expected HTTP 404 with the designed page and route back.
- CSP, content-type protection, referrer policy, permissions policy, and cross-origin opener policy are present.

## Earlier findings disposition

All earlier review and verification items remain closed. The repair did not regress first-screen wording, sample isolation, settings preservation, hidden plans, stale-plan rejection, reconnects, rematches, token expiry, client/server movement alignment, keyboard and focus handling, reduced motion, text zoom, touch sizes, route metadata, legal pages, tenant isolation, restart persistence, or rate limiting.

The two open verification-1 findings are now closed by direct live and clean-checkout evidence. No earlier minor finding reopened.

## Known constraints and next steps

There are no known functional gaps in the admitted first-release scope. The game intentionally has no accounts, matchmaking, ranking, progression, purchases, AI integration, or third-party realtime provider.

SQLite safety depends on the one-replica deployment and durable `/data` mount. Do not scale this service above one replica without moving room state to a different store. The catalog description remains a verb-first 88-character line and was copied to `/work/.evidence/catalog-description.txt`. There is no billing offer because the researched product is free.
