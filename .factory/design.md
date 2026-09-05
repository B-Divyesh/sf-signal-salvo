# Signal Salvo visual thesis

## Direction

Signal Salvo uses a **bathymetric paper theatre**: a top-down tactical chart built from cut-paper depth bands, inked grid marks, and small enamel-like vessels. It keeps the subject abstract and avoids military realism. The uneven coast-like forms make each match feel distinct while the crisp command pieces keep planning readable.

The game itself occupies the first screen. A narrow paper briefing strip explains the job beside the live board on desktop and stacks above it on phones. There is no separate menu wall.

## Palette

The interface is deliberately single-mode so the board reads consistently in a shared call and in screenshots.

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#142F35` | Primary text, grid, deep water |
| `--ink-soft` | `#3E5B5F` | Secondary text |
| `--paper` | `#F4EDDA` | Page background |
| `--paper-high` | `#FFF9E9` | Raised controls and panels |
| `--shallows` | `#B8D9CE` | Light water band |
| `--current` | `#2E7773` | Current and focus treatment |
| `--coral` | `#D6533C` | Primary action and danger |
| `--sun` | `#E8B84D` | Pending commands and warnings |
| `--success` | `#357152` | Confirmed and win states |

All normal text combinations are designed for at least 4.5:1 contrast. Coral is paired with dark ink when it is used as a fill.

## Type and spacing

- Display: Georgia with the system serif fallback. Its sturdy, printed forms support the chart-room character without a font download.
- Body and controls: `ui-sans-serif`, system UI, sans-serif. Short labels remain clear at phone size.
- Numeric telemetry uses the system monospace stack with tabular figures.
- Spacing follows an 8 px base: 4, 8, 12, 16, 24, 32, 48, 64.
- Buttons and board cells have at least 44 px targets. The readable copy measure is 68 characters.

## Shape and interaction grammar

- Panels resemble offset paper sheets: 2 px ink borders, small 2–6 px corner cuts, and hard 4 px shadows.
- Queued commands appear as numbered paper chits. Removing and replacing a command updates the visible order immediately.
- Board cells are explicit buttons with row and column names. Color is always paired with a symbol or text.
- Resolution advances as a short sequence of printed log lines, so outcomes remain legible without motion or sound.

## Motion and sound

- Paper chits travel no more than 12 px over 180–240 ms when added.
- Sonar is one expanding ring over 500 ms. Match results use updated integrity text and log lines without flashing.
- `prefers-reduced-motion` removes translation, ring growth, and smooth scrolling. State changes remain visible through text and contrast.
- Sound is off by default. A persistent setting enables short synthesized tones only after a user action. No audio asset or autoplay is used.

## Difficulty and session shape

Each match has six simultaneous rounds. Players command two signal craft and queue exactly three commands per round. A visible current shifts every live craft after commands resolve. Sonar commands and exposed wake marks create readable partial information. A craft is disabled after two hits; the winner disables both opposing craft or has more integrity after round six. A draw is possible.

The sample match uses seed `SALVO-DEMO-17` and a deterministic opponent. Its scripted command sequence reaches an actual end screen in under three minutes during manual play and immediately in the regression runner. Online rooms usually take two to four minutes because players have up to 20 seconds to plan each round.

## Asset plan and provenance

- The live board, vessels, current arrows, sonar marks, command icons, favicon, and 404 illustration are hand-authored with Canvas/CSS/SVG in this repository. They contain no third-party art.
- One generated bathymetric scene provides the landing background and the 1200×630 social preview. It is scenery only; no required text is baked into it.
- Generation prompt sheet (2026-09-05):

  - Use case: `stylized-concept`
  - Asset type: wide browser-game atmosphere and social preview
  - Primary request: an abstract overhead ocean tactics table made from layered cut paper, with two tiny geometric signal craft and one circular sonar ripple
  - World and materials: handmade bathymetric contour layers, visible paper fibres, screen-printed ink, enamel game pieces
  - Composition: 1200×630 landscape; action in the lower-right half; calm negative space in the upper-left; no horizon
  - Light: warm raking desk light with restrained shadows
  - Palette: parchment, deep blue-green, sea-glass green, coral red, muted mustard
  - Avoid: text, letters, numbers, logos, watermark, flags, weapons, explosions, realistic submarines, people, gradients, neon, photorealism

The generated source and prompt sidecar live in `assets/src/`. Shipping derivatives live in `public/assets/`. Generated imagery is disclosed in the footer.

## Responsive intent

- At 390 px the first screen shows the job, sample action, room entry, and full playable board without a horizontal page scroll.
- The command library stays in a compact three-column grid and the round log moves below the board.
- On desktop, the board, status, and queue share one wide play surface while the introduction stays narrow.
- At 200% text zoom, panels stack and no action is obscured by fixed chrome.
