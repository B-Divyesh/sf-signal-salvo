# Signal Salvo

Signal Salvo is a free two-player browser tactics game for friends in a call. Each player secretly queues three commands, then both plans resolve together across six rounds. The intended session is one short call and needs no account or download.

The first release includes room codes, two signal craft per player, changing currents, sonar contacts, pulse damage, reconnection during a match, an end screen, and one-tap rematches. It does not include matchmaking, rankings, progression, purchases, or realistic military imagery.

## Try the sample

Open `/demo` or select **Try it with sample data**. The sample uses seed `SALVO-DEMO-17` and a deterministic opponent. Select **Queue sample plan**, lock it, and repeat until the result screen appears. Sample play stays in memory and uses only the `demo:signal-salvo:*` storage namespace.

## Run locally

Prerequisites: Node.js 22, npm 10, the current stable Rust toolchain, and Chromium for Playwright 1.58.2.

```bash
npm ci
cargo run --manifest-path server/Cargo.toml
```

In another terminal:

```bash
npm run dev
```

The client opens at `http://127.0.0.1:5173`. It uses the room service at `http://127.0.0.1:8787`. With no configuration, the server listens on port 8080 and stores SQLite beside its binary. Set `PORT=8787` for the documented local client. Set `SIGNAL_SALVO_DB` only when a local database path is useful.

## Test every claim

From a clean checkout:

```bash
npm ci
npm test
```

`npm test` builds the static client, runs deterministic unit tests, runs Rust route and persistence tests, starts both local services, and exercises the product in Chromium. Individual public claims and their exact commands are listed in `.factory/claims.json`.

Other useful checks:

```bash
npm run build
npm run test:unit
npm run test:backend
npm run test:e2e
```

The production client bundle is written to `dist/`. The tested animation loop sustains at least 55 frames per second in a 390×844 Chromium viewport.

## Deploy

The client is a static Vite build. The room service is a separate product-owned container with SQLite at `/data`, one replica, and its own health endpoint.

```bash
npm run build
WO_DATA_DIR=/data /opt/fleet/lib/deploy-container.sh signal-salvo-realtime . Dockerfile 8080
/opt/fleet/lib/deploy-static.sh signal-salvo dist
```

The container starts with only `PORT`; it generates random player tokens for each room and stores only token hashes. `/health` returns the implementation build SHA. The static client allows connections only to the product-owned realtime origin.

## Privacy

The sample calls no game service. Online commands go only to `signal-salvo-realtime.sociobot.in`. The site has no analytics, ads, trackers, external fonts, or third-party scripts. Each reconnect token stops working after its player receives the final result.

See `/privacy` and `/terms` in the product for the visitor-facing policy.

## License

MIT. Generated scenery is original to this product; its prompt and review record are in `.factory/design.md` and `assets/src/`.
