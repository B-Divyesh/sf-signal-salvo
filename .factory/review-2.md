# Play a six-round tactics match — review 2

Date: 2026-09-06

## Verdict

**FAIL — 4 findings and 0 untested claims.**

All declared claim commands pass, and the live game completes. PASS is not allowed because the phone result transition, keyboard focus contrast, metadata terminology, and README session-length requirement have open findings.

## Reviewed revisions

- Implementation candidate: `db97f2af7c994394f6fd0b129c3340a031249a43`.
- Documentation revision at review start: `970c0ec751135287eb2eb2d60154d0ce9cb814de`.
- Live URL: https://signal-salvo.sociobot.in
- Commits after the implementation candidate change only `.factory` reports and handoff files.
- Live `/health` reports the implementation candidate SHA. Live JavaScript and CSS SHA-256 values exactly match the clean candidate build.

## Findings

1. **Medium — the phone sample does not bring its result heading into view.** In a fresh 390×844 touch context, the deterministic sample reached **You won the match** after three rounds. Immediately after the final lock, the page remained at `scrollY=1246`. The result heading occupied viewport coordinates `-27` to `2.94`, while the sticky sample bar occupied `0` to `62.72`. Focus was on the document body. The visible viewport showed **Play the sample again** and the round report, but not the result title or integrity summary. This weakens the required action-to-result feedback and gives keyboard or screen-reader users no focus change to the new result. Evidence: `/work/.evidence/review-2/live-sample-end-phone-viewport.png` and `focus-and-mobile-end.json`. Move focus to `#end-title` when the sample finishes and give that target enough scroll offset for the sticky bar. Add a phone assertion that the result heading is in the viewport and unobscured.
2. **Medium — the keyboard focus indicator misses the required 3:1 contrast.** A real Tab press focuses **Skip to the game** and produces the declared 4 px outline. Its computed color is `rgb(232, 184, 77)` (`#e8b84d`) against `rgb(244, 237, 218)` (`#f4edda`), a measured contrast ratio of **1.58:1**. The attached accessibility contract requires at least 3:1. The same yellow outline is global, so controls on the paper surfaces share the problem. Evidence: `/work/.evidence/review-2/focus-ring-phone.png` and `focus-and-mobile-end.json`. Use a darker outline on light surfaces or a two-color indicator that preserves contrast on both light and dark panels.
3. **Low — public metadata uses a second word for commands.** The interface, README, and copy audit consistently call each queued action a **command**, but the HTML meta and Open Graph descriptions say **moves**. This breaks the plain-words rule to use one term for one concept and contradicts the copy audit’s terminology table. Use **commands** in both descriptions.
4. **Low — the README does not state the intended session length as a duration.** It says a session is “one short call.” The browser-game contract requires a numeric intended duration. The design record already says online rooms usually take two to four minutes. Add a measured duration to the README and register a quantitative claim test if that number is published.

## Job, audience, and first action

The job is to play a six-round two-player tactics match. The audience is two friends on a call who want tactics without a download, account, or twitch reflexes. The first action is **Try it with sample data**.

Fresh 1440×900 desktop and 390×844 phone contexts showed that job, audience, action, and part of the playable board before scrolling. Both had 0 px horizontal overflow and no initial console errors.

## Live game evidence

- The first action entered `/demo` in one click.
- The persistent label **Demo — sample data, nothing is saved** remained present through active play and the result.
- Desktop and phone sample runs each reached **You won the match** after three resolved rounds. The populated report recorded hits, a held position, a current shift, and the winner. The final integrity was 2 to 0.
- The phone loop measured 60 fps, above the stated 55 fps floor.
- **Play the sample again** and **Reset demo** returned the sample to round 1 with `0 of 3` commands.
- A separate real-settings value remained unchanged. No real room session appeared, and sample traffic stayed on the static site origin.
- The phone result visibility defect is finding 1. The end state exists and can be reached by scrolling, but its title is not presented after the final action.

Two independent live clients, one desktop and one phone, created and joined a five-letter room. Player A locked a plan and reloaded. The lock recovered, while player B still had three empty opponent slots and no revealed command log. Both clients completed all six rounds and reached matching draw results. After waiting beyond the polling interval, there were no failed room responses or console errors. Both reconnect sessions cleared, and **Create a rematch** produced a different room code.

## Claims from a clean checkout

A clean clone of documentation revision `970c0ec` was installed with `npm ci`. `npm test` passed the production build, 4 frontend unit tests, 8 Rust tests, and 18 Chromium tests. Each exact command from `.factory/claims.json` was then run independently.

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

The registry has 15 entries and 15 matching tags. Every ID appears exactly once, and no unregistered tag exists. No public behavioral claim was left untested. Finding 4 is a missing documentation requirement, not an existing quantitative claim that was left untested.

`npm run build`, `cargo fmt --check --manifest-path server/Cargo.toml`, and `cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings` passed. `dist/` contains 34.13 KB raw / 11.66 KB gzip JavaScript and 16.73 KB raw / 4.65 KB gzip CSS. The AVIF scene is 44.03 KB.

## Accessibility, routes, privacy, and recovery

- Live Playwright axe scans found zero serious or critical violations on `/`, `/demo`, `/privacy`, `/terms`, `/404.html`, and a missing route. Lighthouse scored 100 for accessibility. Neither tool detects the focus-indicator contrast in finding 2.
- The supplied `verify-url.sh` passed `/`, `/demo`, `/privacy`, and `/terms` with titles, `lang="en"`, one `h1`, one `main`, image alternatives, labelled buttons, and zero console errors.
- History navigation changed route titles, focused the new `h1`, and updated the polite announcement. Back and forward restored the correct route and heading focus.
- Reduced motion changed craft animation duration to `1e-05s`. At 200% text size the phone had 0 px horizontal overflow. All visible phone controls measured at least 44×44 CSS px.
- Invalid numeric and missing room codes produced recovery text. An injected room-service failure produced connection guidance, and a retry created a room. Incomplete plans stayed disabled, the fourth command was blocked, Enter activated commands, and board arrow navigation passed in the clean suite.
- The privacy and terms pages loaded, and the privacy request mail link was present. Sample requests were same-origin. Online requests were limited to the static site and product-owned realtime service. Isolated tests verified SQLite and request-log privacy.
- The site makes no offline or update promise, so neither behavior was credited. There is no useful missing AI step for this deterministic two-player game.
- All crawled site links and the external Param Factory link returned successful responses. The deliberate missing route returned HTTP 404 with the designed page and a working return route; its single 404 console line is expected, not a defect.

## Performance and backend

- Mobile Lighthouse: performance 100, accessibility 100, best practices 100, SEO 100; FCP 1.0 s, LCP 1.1 s, CLS 0, TBT 80 ms.
- Live `/health`: HTTP 200, `ok: true`, build SHA `db97f2af7c994394f6fd0b129c3340a031249a43`.
- A token from one fresh room received HTTP 401 when used against a second room.
- A fresh request identity reached HTTP 429 and received `Retry-After: 10`.
- A fresh live API match completed six rounds, returned a draw, then returned HTTP 410 for both expired player tokens.
- The independent `room-restart-persistence` command started a real isolated Rust service with a new SQLite file, locked one plan, stopped and restarted the process on the same file, recovered the lock, and completed the round. The live service was not restarted because this review had no deployment action; exact live static and health revisions match the tested implementation.

## Earlier findings

| Earlier item | Current disposition |
| --- | --- |
| Late HTTP 410 after a completed online match | Closed. The fresh live two-client run had zero failed room responses and zero console errors after the result. |
| Personal-data storage statement lacked a claim test | Closed. `no-personal-data-storage` passed independently against a new SQLite database. |
| Request-log privacy statement lacked a claim test | Closed. `request-log-privacy` passed independently with captured service logs. |
| First-screen wording, board visibility, sample isolation, reset, secrecy, reconnect, rematch, token expiry, and movement alignment | Remain closed through the fresh live runs and clean tests. Finding 1 is a newly measured phone result-position defect. |
| Keyboard, focus, reduced motion, text zoom, touch targets, and contrast | Reopened in part. Keyboard operation, focus presence, reduced motion, zoom, and target size pass; focus-indicator contrast fails as finding 2. |
| Route titles, history, metadata assets, legal pages, links, and designed 404 | Functional checks remain closed. Finding 3 is a terminology defect in metadata copy. |
| SQLite durability, health, tenant isolation, and rate limiting | Remain closed through the isolated restart test and fresh live checks. |

## Evidence and scope

Evidence is in `/work/.evidence/review-2/`, including `live-results.json`, phone and desktop screenshots, `focus-and-mobile-end.json`, `claim-summary.tsv`, `claim-commands.log`, `clean-npm-test.log`, URL-verifier results, asset hashes, and `lighthouse.json`.

No product code, deployment, service configuration, or existing user data was changed. Only this review report and the handoff are changed in the repository.
