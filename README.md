# Tetrix

Low power Tetrix (Tetris) clone built with **Phaser 4 Canvas** and Vite. It runs entirely on the client, saves progress offline with localForage, and targets both desktop and iOS Chrome with a capped 30 FPS render loop to minimize battery usage.

## Features

- Phaser 4, canvas-only rendering for consistent cross-browser behavior.
- Board UI, HUD (score, level, lines, next piece), save/restart/pause controls, and touch buttons are all drawn inside the canvas for responsive interaction.
- Autoscaled layout: the playfield expands as screen width allows, and the HUD slides to the right.
- Saving/loading backed by localForage; Wake Lock + `nosleep.js` keep iOS screens awake.
- Gesture suppression to prevent zoom/double-tap on mobile Safari/Chrome.
- Deterministic Tetrix engine with tests for line clearing, snapshots, and hard drop rules.
- GitHub Actions pipeline runs lint-free builds/tests and deploys via Pages artifacts.

## Getting Started

```bash
npm install
npm run dev
```

The dev server listens on http://localhost:7402 (and `0.0.0.0`), matching the user request. Visit it on desktop or mobile using the host/IP allowed via `server.allowedHosts`.

### Production Build

```bash
npm run build
```

Artifacts land in `dist/`. The default workflow (`.github/workflows/deploy.yml`) runs `npm ci`, `npm run test`, `npm run build`, and uploads the bundle for GitHub Pages deployment.

## Tests

```bash
npm run test
```

Vitest executes the Tetrix engine unit tests (`src/tetrixLogic.test.ts`) using a jsdom environment.

## Controls

- **Keyboard:** arrow keys / WASD move/rotate, Space hard drops.
- **Canvas HUD:** pause/resume, save, restart buttons live on the right side.
- **Canvas touch controls:** big left/rotate/right buttons with hold-to-repeat, plus a DROP key centered below the board.

## Notes

- The Vite config sets `base` to `/${repoName}/` when `GITHUB_REPOSITORY` is defined, making GitHub Pages paths work automatically.
- To deploy from a branch other than `master`, adjust the `github-pages` environment in Settings or push the built site to a dedicated `gh-pages` branch.
