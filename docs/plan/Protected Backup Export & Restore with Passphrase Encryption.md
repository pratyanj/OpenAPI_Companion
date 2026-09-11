# Implementation Plan: Protected Backup Export & Restore with Passphrase Encryption

Provide optional passphrase encryption for backups using Web Crypto (`AES-GCM` + `PBKDF2`). Developers can export and share backups containing sensitive account credentials and environment tokens safely, requiring team members to provide the passphrase upon restore.

## Proposed Changes

### 1. Cryptographic Utility
#### [NEW] [`src/utils/crypto-backup.ts`](file:///P:/React%20native/OpenAPI_Companion/src/utils/crypto-backup.ts)
- Implement `encryptBackup(plaintextJson: string, passphrase: string): Promise<EncryptedExportBundle>`:
  - Generates a cryptographically random 16-byte salt and 12-byte IV (`crypto.getRandomValues`).
  - Derives an AES-GCM 256-bit encryption key using PBKDF2 (`SHA-256`, 100,000 iterations).
  - Encrypts the payload with AES-GCM.
  - Returns a standard JSON envelope with `encrypted: true`, algorithm metadata, and base64-encoded ciphertext/salt/iv.
- Implement `decryptBackup(bundle: EncryptedExportBundle | string, passphrase: string): Promise<string>`:
  - Derives the AES-GCM key using the bundle's salt and iteration count.
  - Decrypts the ciphertext.
  - Throws or returns an error if the passphrase is incorrect or authentication tag verification fails.
- Implement `isEncryptedBundle(data: unknown): boolean` helper.
- Provide chunked base64 helpers (`uint8ArrayToBase64`, `base64ToUint8Array`) ensuring high performance and safety across browser and Node environments.

---

### 2. Settings & Backup Domain Types
#### [MODIFY] [`src/modules/settings/types.ts`](file:///P:/React%20native/OpenAPI_Companion/src/modules/settings/types.ts)
- Add `EncryptedCryptoMetadata` interface (`algorithm: 'AES-GCM'`, `kdf: 'PBKDF2'`, `iterations: number`, `salt: string`, `iv: string`).
- Add `EncryptedExportBundle` interface.
- Add optional `isEncrypted?: boolean` to `ImportPreview`.

---

### 3. Import/Export Service
#### [MODIFY] [`src/modules/settings/import-export-service.ts`](file:///P:/React%20native/OpenAPI_Companion/src/modules/settings/import-export-service.ts)
- Update `exportAll(passphrase?: string): Promise<Result<string>>`:
  - When `passphrase` is provided: Keep stored authentication passwords (`login.password`) and secret tokens, then encrypt the bundle using `encryptBackup`.
  - When `passphrase` is omitted: Redact sensitive passwords via `redactSecrets` as done today to prevent plain text leaks.
- Update `backup(auto = false, passphrase?: string): Promise<Result<string>>`:
  - Passes `passphrase` to `exportAll`.
- Add `decryptBackup(json: string, passphrase: string): Promise<Result<string>>`.
- Update `previewImport(json: string): Result<ImportPreview>`:
  - If the JSON is encrypted, returns a specialized error or preview indicating passphrase protection is required (`code: 'IMPORT_ENCRYPTED'`).
- Update `applyImport(json: string, mode: ImportMode, passphrase?: string): Promise<Result<ImportSummary>>`:
  - If encrypted, decrypts before parsing and persisting storage keys.

---

### 4. Settings Panel UI
#### [MODIFY] [`src/modules/settings/SettingsPanel.tsx`](file:///P:/React%20native/OpenAPI_Companion/src/modules/settings/SettingsPanel.tsx)
- **Export Backup Modal**:
  - Clicking "Download backup" opens a clean Dialog modal:
    - Passphrase input (optional) with peek toggle (`EyeIcon`).
    - Helpful security guidance explaining that entering a password includes and encrypts account credentials and tokens, while leaving it empty exports safe redacted data.
    - Confirm/Download button.
- **Restore / Decrypt Flow**:
  - When an encrypted backup file is uploaded or pasted:
    - Displays an encrypted backup prompt with password input.
    - "Decrypt & Preview" action with live feedback and incorrect-passphrase error handling.
    - Once decrypted, displays the preview badges (`N entries`, `N projects`, `contains secrets`, `🔒 Decrypted`) and enables "Import".

---

## Verification Plan

### Automated Unit Tests
- Create [`src/utils/crypto-backup.test.ts`](file:///P:/React%20native/OpenAPI_Companion/src/utils/crypto-backup.test.ts):
  - Encrypts and decrypts bundle successfully with valid passphrase.
  - Rejects wrong passphrase with descriptive error.
  - Handles large payloads and special characters.
- Update [`src/modules/settings/import-export-service.test.ts`](file:///P:/React%20native/OpenAPI_Companion/src/modules/settings/import-export-service.test.ts):
  - Backups with passphrase retain `login.password` in encrypted payload.
  - Decrypting with correct passphrase restores passwords.
  - `previewImport` reports encrypted state appropriately.
- Update [`src/modules/settings/SettingsPanel.test.tsx`](file:///P:/React%20native/OpenAPI_Companion/src/modules/settings/SettingsPanel.test.tsx):
  - Prompts for passphrase on export.
  - Decrypts encrypted backup on restore.
- Run full test suite:
  ```bash
  npm test
  ```
- Run production build:
  ```bash
  npm run build
  ```

### Manual Verification
- Test exporting a backup with a passphrase.
- Inspect the exported `.json` file to confirm credentials are in encrypted `ciphertext`.
- Restore the encrypted file using the passphrase to verify credentials and projects restore completely.
