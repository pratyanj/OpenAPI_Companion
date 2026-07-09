# Development Guide — OpenAPI Companion

How to run, test, and load the extension locally. See [`log/`](./log) for progress and [`planning/`](./planning) for the engineering blueprint.

## Prerequisites
- **Node ≥ 20** (`node -v`)
- A Chromium browser: Chrome, Edge, Brave, Arc, or Opera

## 1. Install (one-time)
```bash
npm install
```

## 2. Run the tests
```bash
npm test              # run all unit/integration tests once (Vitest)
npm run test:watch    # re-run on change while developing
npm run test:coverage # tests + coverage report (text + coverage/ HTML)
```
Expected today: **8 files, 58 tests passing.**

## 3. Quality gates (what CI runs)
```bash
npm run typecheck     # tsc --noEmit (strict)
npm run lint          # ESLint (flat config; no `any`)
npm run format:check  # Prettier check   →  npm run format  to auto-fix
```

## 4. Build the extension
```bash
npm run build         # outputs the unpacked MV3 extension to dist/
```

## 5. Load it in the browser
1. Open `chrome://extensions` (or `edge://extensions`, etc.).
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the **`dist/`** folder.
4. The **OpenAPI Companion** card appears — click the toolbar icon to see the popup (shows the version).
5. Open a **Swagger UI** page to see the sidebar mount:
   - Public demo: <https://petstore.swagger.io/>
   - Or a local API's docs (e.g. FastAPI `/docs`)
   - The sidebar shows the detected **project name + id** and a working **light/dark theme toggle**.
   - On non-Swagger pages the extension stays dormant (nothing is injected).

> Current state: the extension detects Swagger, identifies the project, and mounts the shell. **Auth/request capture is not wired yet** (Sprint 4+), so the sidebar is informational for now.

## 6. Live development loop
```bash
npm run dev           # Vite + CRXJS with HMR for the injected UI
```
After changing the background worker or `manifest.config.ts`, click the **reload** icon on the extension card in `chrome://extensions`.

## 7. End-to-end tests (optional)
```bash
npx playwright install chromium   # one-time (~150 MB download)
npm run build                     # E2E runs against dist/
npm run test:e2e                  # smoke: extension loads, SW registers, popup renders
```

## 8. Troubleshooting
| Symptom | Explanation / fix |
|---|---|
| `npm audit` reports high/critical | Dev-toolchain only (Vite/Vitest/esbuild) — **not shipped**. The shipping gate is `npm audit --omit=dev` → **0 vulnerabilities**. |
| Sidebar doesn't appear | Confirm the page is actually Swagger UI; reload the unpacked extension after a rebuild. |
| E2E can't find the service worker | Run `npm run build` first; the Playwright fixture uses `channel: 'chromium'` (already configured) since the headless shell can't load extensions. |
| Changes not reflected | Rebuild (`npm run build`) and reload the extension card; for UI-only changes use `npm run dev`. |

## Project layout (quick map)
```
src/
├── background/      MV3 service worker (runs migrations on install/update)
├── content/         detects Swagger → identifies project → mounts sidebar
├── sidebar/         React sidebar shell (minimal for now)
├── popup/           toolbar popup
├── adapters/        SwaggerAdapter — the ONLY code touching the Swagger DOM
├── core/            storage, events, project (the Foundation)
├── modules/         feature modules (Auth, Request, … — built per sprint)
├── services/        ThemeManager, etc.
└── tests/           test setup + in-memory storage fake
```
