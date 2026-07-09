# Security Policy

OpenAPI Companion is a **local-first, zero-telemetry** browser extension. We take the security and privacy of developer data seriously — see `docs/13_SECURITY_AND_PRIVACY.md` for the full threat model and `docs/19_DESIGN_DECISIONS.md` (DD-031…DD-039) for the decisions referenced below.

## Supported Versions

The project is pre-release. Once v1.0.0 ships, security fixes target the **latest released minor version**; older minors are not maintained.

| Version | Supported |
|---------|-----------|
| `develop` (pre-release) | ✅ |
| latest released minor (after v1.0) | ✅ |
| older releases | ❌ |

## Reporting a Vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through one of:

1. **GitHub Private Vulnerability Reporting** (preferred) — repository **Security** tab → **Report a vulnerability**.
2. **Email** — `security@TODO-set-project-domain` *(maintainer: replace with a monitored address before going public).*

Please include:
- A clear description of the issue and its impact.
- Steps to reproduce (and the browser + extension version).
- Any proof-of-concept, logs (with secrets redacted), or screenshots.

### What to expect
- **Acknowledgement** within **3 business days**.
- An initial **assessment** within **7 business days**.
- Coordinated disclosure: we will agree on a timeline and credit you (if you wish) in the release notes / changelog `Security` section once a fix ships.

Please give us reasonable time to remediate before any public disclosure.

## Scope

**In scope**
- The browser extension code (background service worker, content script, sidebar UI, services).
- Storage handling, data isolation between projects, import/export validation.
- Token/credential handling.

**Out of scope**
- Vulnerabilities in Swagger UI or other OpenAPI documentation tools themselves.
- Vulnerabilities in the user's own backend/API.
- Social-engineering, physical access, or compromise of the user's machine/browser profile.
- Issues requiring a already-compromised browser or malicious co-installed extension with elevated privileges.

## Our Security Posture

OpenAPI Companion is designed to be safe by default:

- **Local-first.** All data is stored on the user's device via `chrome.storage.local`. Nothing is uploaded to any server during normal operation. There is **no telemetry** and no analytics by default.
- **No remote code.** The extension never loads or executes remote scripts. All code ships in the package.
- **Minimal, justified permissions** (DD-035): `storage`, `activeTab`, `scripting`, `unlimitedStorage`, `downloads`. Each is justified in the store listing; no broad host permissions beyond the documentation page in view.
- **Never modifies backend requests.** Variable substitution is Companion-scoped at populate-time only (DD-032); the extension does not rewrite outgoing requests.
- **Token handling** (DD-037): credentials stay local, are masked in the UI, are **never logged** (enforced by lint rule + test), and are never shared across projects. Exported/backed-up files are flagged as potentially containing secrets. Optional passphrase-protected encryption-at-rest is planned for v1.1.
- **Project isolation.** Each detected project has an independent storage namespace; cross-project data access is not permitted.
- **Validated imports.** Imported/restored files are schema-validated and sanitized before use; untrusted content is never rendered as HTML or executed (XSS protection).
- **Safe migrations.** Storage migrations snapshot-before-migrate and roll back on failure so updates never corrupt user data.

## Security in Development

Every pull request includes a security review (see `CONTRIBUTING` and `planning/13_TEST_PLAN.md`):
- No secrets in code or logs.
- Input validation and least privilege.
- Dependency audit (`npm audit`) gate in CI.
- The pre-release security checklist (`planning/19_RELEASE_PLAN.md`) must pass before any release.

> Note: two posture decisions — DOM-based response capture (DD-033) and plaintext token storage for v1.0 (DD-037) — require explicit security-reviewer sign-off before their features ship.
