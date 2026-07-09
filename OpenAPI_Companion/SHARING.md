# Sharing OpenAPI Companion with your team

Until the extension is on the Chrome Web Store, share it as a **packaged
unpacked build** — teammates load it via "Load unpacked". No store account,
no review, works today.

## Make the shareable file

```bash
npm run package
```

This builds the extension and writes **`share/openapi-companion-<version>.zip`**
(source maps stripped; ~0.1 MB). Send that `.zip` to your team over
email / Slack / Drive — whatever you use.

The zip contains an `INSTALL.md` with the recipient steps, so teammates don't
need any other instructions.

## What teammates do (also in the zip's INSTALL.md)

1. Unzip → keep the `openapi-companion-<version>` folder somewhere permanent.
2. Open `chrome://extensions` (or `edge://`, `brave://`).
3. Turn on **Developer mode**.
4. **Load unpacked** → select that folder.
5. Open any Swagger UI page (e.g. https://petstore.swagger.io/) — the sidebar appears.

## Updating them later

Re-run `npm run package`, send the new zip. They replace the folder and click
the reload icon on the extension's card. (Unpacked builds don't auto-update.)

## Notes & options

- Chrome may periodically show a "Disable developer mode extensions" prompt —
  normal for unpacked builds; just dismiss it.
- Each teammate's install gets its own extension ID (derived from the folder
  path). That's fine — the extension doesn't depend on a fixed ID.
- **Smoother distribution later:** publishing to the Chrome Web Store as an
  **Unlisted** item gives one-click install, auto-updates, and no dev-mode
  prompt — link-only, not publicly searchable. It needs a one-time \$5 developer
  account and a short review. Revisit at Sprint 15/16 (release).
