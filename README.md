# OpenAPI Companion 🚀

> **OpenAPI Companion** is a productivity-focused browser extension (Manifest V3) that turns static OpenAPI/Swagger documentation pages into a persistent, interactive API testing workspace. 

No more copying values back and forth to external REST clients. Work right inside your API documentation.

---

## 🌟 Key Features

- **💼 Persistent Workspace:** Keeps your headers, authorization keys, and query parameters saved per project.
- **🔐 Smart Authentication:** Pre-fills API keys, Bearer tokens, or OAuth credentials based on the endpoint schema.
- **⚡ Quick request runner:** Run custom or modified requests right from the sidebar without leaving Swagger.
- **⏳ Request History & Collections:** Saves past requests, responses, and lets you organize them into folders.
- **🌍 Environment Variables:** Switch easily between local, staging, and production environments.
- **🎭 Mock & Fake Data Generator:** Dynamically creates fake payloads for request bodies in one click.

---

## 🛠️ Repository & Project Structure

The codebase is organized into two main folders:
- **`docs/`** - Project architecture details and developer documentation.
- **`OpenAPI_Companion/`** - The extension source code (React, TypeScript, Vite, Tailwind CSS).

A quick map of the extension codebase (`OpenAPI_Companion/src/`):
```
src/
├── background/      # MV3 Service Worker (handles migration, state, and storage)
├── content/         # Injects and mounts the UI shell into Swagger/OpenAPI pages
├── sidebar/         # React sidebar interface (Auth, History, Settings)
├── popup/           # Toolbar browser-action popup
├── adapters/        # DOM adapters to read from and write back to Swagger pages
├── core/            # App Core: storage engine, event bus, and shared state
├── modules/         # Feature modules (Auth, Request, Environment, etc.)
└── services/        # Helper services (e.g. ThemeManager)
```

---

## 🚀 Getting Started

Detailed developer documentation can be found in [OpenAPI_Companion/DEVELOPMENT.md](file:///p:/React%20native/OpenAPI_Companion/OpenAPI_Companion/DEVELOPMENT.md). Below is the quick setup:

### Prerequisites
- **Node.js ≥ 20**

### 1. Install dependencies
```bash
cd OpenAPI_Companion
npm install
```

### 2. Live development
```bash
npm run dev
```

### 3. Build for Production
```bash
npm run build
```

### 4. Load the Extension
1. Open your browser's extensions manager page (e.g., `chrome://extensions` or `edge://extensions`).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the **`OpenAPI_Companion/dist`** folder.
4. Go to any Swagger page (e.g., [Swagger Petstore](https://petstore.swagger.io/)) to see the OpenAPI Companion sidebar load!

---

## 📦 Automated Builds & Downloads

This repository uses **GitHub Actions** to automate builds:
- **Continuous Integration (`CI`):** Runs lints, formatting checks, typechecks, unit tests, and security audits on every pull request or push.
- **Rolling Releases (`Release on Push`):** Every push to the `main` branch automatically updates a pre-release version tagged as `latest` with a build of the unpacked extension zipped up (e.g., `openapi-companion-<version>-<sha>.zip`).

You can download the latest dev-build zip directly from your GitHub repository's **Releases** page, unzip it, and load it into Chrome via **Load unpacked**.

---

## 🧪 Testing

OpenAPI Companion uses [Vitest](https://vitest.dev/) for unit and component testing, and [Playwright](https://playwright.dev/) for end-to-end integration tests.

```bash
# Run unit tests
npm test

# Run tests with HTML coverage report
npm run test:coverage

# Run Playwright E2E smoke tests
npm run test:e2e
```

