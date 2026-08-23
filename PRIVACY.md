# Privacy Policy for OpenAPI Companion

**Effective Date:** August 18, 2026  
**Last Updated:** August 18, 2026  

OpenAPI Companion ("the Extension") is committed to protecting your privacy. This Privacy Policy outlines how the Extension handles user information and data.

---

## 1. Zero Data Collection & Storage Principle

OpenAPI Companion operates with a **strict offline, local-first architecture**:

- **No Data Collection:** OpenAPI Companion does **NOT** collect, transmit, track, or share any personal data, usage analytics, telemetry, or user identifiers.
- **No External Servers:** The Extension does not connect to any remote developer servers, external databases, or third-party analytics services.
- **Local Storage Only:** All data entered into the extension—including authentication tokens, API keys, request presets, history logs, and mock data configurations—is stored strictly and locally on your own machine using Chrome's native storage API (`chrome.storage.local`).

---

## 2. Permissions & Data Handling

The Extension requests specific browser permissions solely to provide its core developer functionality:

- **`storage` & `unlimitedStorage`:** Used exclusively to save your request templates, authentication tokens, environment variables, and history logs locally on your device.
- **`activeTab`:** Used strictly to detect active Swagger UI / OpenAPI documentation pages and enable the side panel companion when initiated by you.
- **`sidePanel`:** Used to display the companion interface alongside your Swagger UI documentation page.
- **Host Permissions (`http://*/*`, `https://*/*`):** Required to allow the extension to interact with self-hosted and cloud-hosted OpenAPI/Swagger documentation pages on localhost or any remote developer domain.

---

## 3. Third-Party Sharing

We do **not** sell, rent, trade, or transfer any user data to third parties under any circumstances. No user data is ever processed outside of your local browser environment.

---

## 4. Open Source & Transparency

OpenAPI Companion is open-source. You can review the complete source code and security practices on GitHub:  
[https://github.com/pratyanj/OpenAPI_Companion](https://github.com/pratyanj/OpenAPI_Companion)

---

## 5. Contact Information

If you have any questions, suggestions, or concerns regarding this Privacy Policy, please open an issue on GitHub or contact the maintainer at:  
**Repository:** [https://github.com/pratyanj/OpenAPI_Companion](https://github.com/pratyanj/OpenAPI_Companion)
