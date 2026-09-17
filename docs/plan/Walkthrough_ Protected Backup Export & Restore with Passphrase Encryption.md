# Walkthrough: Protected Backup Export & Restore with Passphrase Encryption

## Summary of Changes
Completed **Step 2** from the sprint backlog: added optional passphrase-based encryption (`AES-GCM` 256-bit + `PBKDF2` with 100,000 iterations) for backup export and restore. Developers can now share complete backups with teammates that include account credentials (`login.password`) and secret tokens securely.

### 1. Web Crypto AES-GCM + PBKDF2 Utility
- Created [`src/utils/crypto-backup.ts`](file:///P:/React%20native/OpenAPI_Companion/src/utils/crypto-backup.ts):
  - `encryptBackup`: Derives an AES-GCM key from the user's passphrase using PBKDF2 (`SHA-256`, 100,000 iterations, random 16-byte salt, random 12-byte IV).
  - `decryptBackup`: Derives the decryption key and decrypts the backup ciphertext. Rejects wrong passphrases or tampered payloads with clear error messages.
  - `isEncryptedBackup`: Detects encrypted backup files.
  - `uint8ArrayToBase64` / `base64ToUint8Array`: Chunked base64 conversion preventing call stack overflow.
- Exported in [`src/utils/index.ts`](file:///P:/React%20native/OpenAPI_Companion/src/utils/index.ts).

### 2. Service-Layer Integration
- Updated [`src/modules/settings/import-export-service.ts`](file:///P:/React%20native/OpenAPI_Companion/src/modules/settings/import-export-service.ts):
  - `exportAll(passphrase?: string)`:
    - If a passphrase is provided: preserves raw account passwords (`login.password`) and encrypts the entire backup bundle into an encrypted envelope.
    - If omitted: redacts passwords to keep plaintext backups safe from accidental leakage.
  - `backup(auto = false, passphrase?: string)`: passes the passphrase to `exportAll`.
  - `decryptBackup`: decrypts and validates encrypted payloads.
  - `previewImport`: detects encrypted bundles and signals `code: 'IMPORT_ENCRYPTED'`.
  - `applyImport`: decrypts before importing when provided with an encrypted bundle and passphrase.

### 3. Settings UI Upgrades
- Updated [`src/modules/settings/SettingsPanel.tsx`](file:///P:/React%20native/OpenAPI_Companion/src/modules/settings/SettingsPanel.tsx):
  - **Passphrase Export Box**:
    - Optional passphrase input with Show/Hide toggle (<kbd>👁</kbd>).
    - Helper note explaining that entering a passphrase encrypts and preserves credentials, while leaving it empty redacts passwords for safety.
    - Dynamic button label: updates from `Download backup` to `Download encrypted backup` as soon as a passphrase is typed.
  - **Encrypted Restore Flow**:
    - Automatically detects encrypted files on upload or JSON paste.
    - Displays an **"Encrypted Backup Detected"** unlock card with passphrase input and Show/Hide toggle.
    - "Decrypt" button unlocks and previews the contents with a `🔒 Decrypted` badge.
    - Shows clear error message if an incorrect passphrase is typed.

---

## Verification & Testing

### 1. Automated Tests
- Unit tests in [`src/utils/crypto-backup.test.ts`](file:///P:/React%20native/OpenAPI_Companion/src/utils/crypto-backup.test.ts) (7 tests passed).
- Unit tests in [`src/modules/settings/import-export-service.test.ts`](file:///P:/React%20native/OpenAPI_Companion/src/modules/settings/import-export-service.test.ts) (12 tests passed).
- Integration tests in [`src/modules/settings/SettingsPanel.test.tsx`](file:///P:/React%20native/OpenAPI_Companion/src/modules/settings/SettingsPanel.test.tsx) (10 tests passed).
- Full test suite passed across the entire project:
  ```text
  Test Files  68 passed (68)
       Tests  601 passed (601)
  ```

### 2. Production Build
- Built clean production bundle in `dist/` with `npm run build` in 11.22s.

### 3. Git Deployment
- Marked item 2 as completed in [`TODO.md`](file:///P:/React%20native/OpenAPI_Companion/TODO.md).
- Committed and pushed to GitHub branch **`V1.1.4`**:
  - Commit `d94ae81`: `feat(settings): add passphrase encryption for backup export and restore using AES-GCM`
