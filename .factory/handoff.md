# Signal Salvo handoff

Date: 2026-09-06

## Outcome

Signal Salvo is a complete free first release for two friends in a call. A visitor can start the deterministic sample in one click or create a five-letter online room without an account. Each player privately queues three commands. Both plans resolve together for up to six rounds, followed by a win, loss, or draw screen and a rematch action.

The job, audience, and first action appear before scrolling on both a 390×844 phone and a desktop. The playable board is also present on that first screen rather than behind a menu.

## Revisions and deployment

- Implementation SHA: `a16d0052ee9fce5c87775a819f9516d36d5fe28a`.
- Documentation SHA: `44918ed89be37428cda03e7ab6db54059c13e1ea`.
- The handoff commit is a later report-only commit. It does not change either deployed artifact.
- Static product: `https://signal-salvo.sociobot.in`, rebuilt and deployed after the implementation and documentation commits.
- Realtime product: revision `sf-signal-salvo-realtime--0000007`, image build `a16d0052ee9f`, healthy with 100% traffic.
- `/health` returns the full implementation SHA.
- Realtime configuration remains single-revision with `minReplicas: 1`, `maxReplicas: 1`, and the existing `sf-signal-salvo-realtime-data` Azure Files volume mounted at `/data`.
- SQLite uses `/data/signal-salvo.sqlite`. The `unix-dotfile` VFS supplies filesystem-based locking suitable for the mounted network share. The original database filename and any earlier room state were retained.

The container deployment wrapper built and installed the successful image, preserved the volume and one-replica bounds, and bound the managed certificate. Its final root-URL poll was interrupted because the room service deliberately returns HTTP 404 at `/`; `/health` and actual room requests were then checked directly. The static deployment wrapper completed successfully.

## Work completed

- Built the product-specific bathymetric paper interface, generated original scene, responsive first screen, live board, command controls, log, result, settings, legal routes, and designed 404.
- Implemented deterministic sample play through a real end state, one-action reset, persistent demo label, and separate `demo:` storage.
- Implemented product-owned online rooms with hashed player tokens, hidden plans, simultaneous resolution, current movement, sonar, wake marks, damage, reconnects, rematches, deadlines, and final token expiry.
- Kept the frontend and server resolution rules aligned, including movement by an adjacent line of craft.
- Added stale-round rejection so a delayed command cannot change a round that already resolved.
- Preserved real settings while entering, resetting, and leaving the sample. Leaving the sample discards demo storage.
- Added recovery for network failures and server conflicts without leaking an opponent plan.
- Added outcome tests for the deterministic end, reset, settings, privacy, independent clients, reconnect, rematch, token expiry, restart persistence, health, rate limiting, invalid input, keyboard use, focus, reduced motion, text zoom, touch sizes, routing, and 404 behavior.
- Added route metadata, sitemap, robots, social preview, security headers, privacy and terms pages, README, MIT license, demo record, copy audit, claims registry, visual thesis, and catalog description.
- Corrected the deployment-only SQLite lock failure at its cause. Startup no longer reads an existing schema during revision handoff, and SQLite uses filesystem locking on the durable network mount.

## Verification

### Clean checkout

A fresh clone at the implementation SHA was installed with `npm ci`.

- Every exact command in `.factory/claims.json` passed individually: 13 of 13.
- `npm test` passed from that clone: build, 4 frontend unit tests, 8 Rust tests, and 16 Chromium browser tests.
- `npm run build` produced `dist/`.
- Production bundle sizes: JavaScript 33.37 KB raw / 11.50 KB gzip; CSS 16.73 KB raw / 4.64 KB gzip.
- `cargo fmt --check --manifest-path server/Cargo.toml` passed.
- `cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings` passed.

### Accessibility and performance

- The URL verifier passed `/`, `/demo`, `/privacy`, and `/terms` with the expected route titles, `lang="en"`, one `h1`, a `main` landmark, complete alternative text, labelled buttons, and no console errors.
- Playwright axe checks found zero serious or critical violations on `/`, `/demo`, `/privacy`, `/terms`, and the 404 page, both locally and against HTTPS.
- Keyboard, dialog focus return, arrow-key board movement, 200% text, reduced motion, and 44 px phone targets have browser regressions.
- Local mobile Lighthouse: performance 100, accessibility 100, best practices 100, SEO 100; FCP 0.90 s, LCP 1.36 s, CLS 0, TBT 0 ms, total transfer 62.7 KB.
- The live 390×844 run measured 60 fps. The automated claim keeps a conservative floor of 55 fps.

### Live browser evidence

Fresh browser contexts checked the HTTPS product after deployment.

- Desktop first screen: job, audience, sample action, plain facts, and playable board visible.
- Phone first screen at 390×844: job, audience, sample action, and board visible without horizontal overflow.
- Sample: entered in one click, completed all six rounds to a real win, retained the sample label, reset to round 1 with an empty queue, and left real settings unchanged.
- Online: two independent browser contexts created and joined a room, kept the first locked plan hidden, reconnected, completed all six rounds to a draw, cleared reconnect tokens, and created a different rematch room.
- Browser console errors: 0.
- Evidence: `.factory/evidence/live-desktop-first-screen.png`, `live-phone-first-screen.png`, `live-sample-end-screen.png`, `live-online-player-a-end.png`, and `live-online-player-b-end.png`.

### Live backend and routes

- Health: HTTP 200 with the implementation SHA.
- Tenant isolation: a valid token from another room received HTTP 401.
- Restart persistence: a locked plan remained in SQLite across an actual replica replacement. Because the platform restart exceeded the 20-second planning deadline, recovery correctly resolved the saved plan and opened round 2.
- Rate limit: request 39 in the live check received HTTP 429 with `Retry-After: 10`; the limit is 40 requests per 10-second window and earlier requests shared that window.
- The service was returned to the original `/data/signal-salvo.sqlite` file after the locking repair, and a new room plus saved plan worked across another replica replacement.
- `/missing-page` returns the expected HTTP 404 with the designed Signal Salvo page. The room service root also returns an intentional JSON 404.
- All internal navigation targets, the Param Factory link, metadata assets, `robots.txt`, and `sitemap.xml` returned their expected status.
- CSP, `X-Content-Type-Options`, `Referrer-Policy`, permissions policy, and frame protection are present.

## Findings disposition

All findings found in the repository and earlier evidence are closed:

- Plain first-screen wording, persistent sample status, demo isolation, real-setting preservation, and reset behavior are verified.
- Online plan secrecy, stale-plan rejection, reconnect, rematch, final token expiry, tenant isolation, restart persistence, and rate limiting are verified by outcomes.
- Client/server current movement now matches.
- Deep links, unique route titles, history focus, static 404 status, metadata assets, legal routes, and external links are verified.
- Phone wrapping, board bounds, touch size, keyboard focus, text zoom, reduced motion, and contrast checks pass.
- The realtime rollout lock on Azure Files was repaired without deleting or replacing the original database.

## Known constraints and next steps

There are no known functional gaps in the admitted first-release scope. The game intentionally has no accounts, matchmaking, ranking, progression, purchases, or third-party realtime provider.

SQLite safety depends on the documented one-replica deployment. Do not scale the realtime app above one replica without moving room state to a different store. The existing Container Apps template has no explicit platform probe; the product-owned `/health` endpoint is healthy and was exercised directly. An unused `signal-salvo-release1.sqlite` diagnostic file may remain on the product volume from rollout recovery; the running service does not read it.

The next product decision should be based on the brief's completion and rematch measures, not speculative paid features.
