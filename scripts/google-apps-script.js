/**
 * ============================================================================
 * OpenAPI Companion - Free Private Google Apps Script Webhook
 * ============================================================================
 *
 * HOW TO SET THIS UP (Takes 2 minutes, 100% Free & Private):
 * 1. Open Google Sheets (https://sheets.new) and create a new sheet.
 *    Name sheet tab: "Leads & Feedback"
 *    Put these column headers in Row 1:
 *    A1: Date | B1: Type | C1: Email | D1: Rating | E1: Category | F1: Message | G1: Version | H1: Browser | I1: OS
 *
 * 2. In Google Sheets, click: Extensions -> Apps Script.
 * 3. Delete any default code in Code.gs, and PASTE THIS ENTIRE SCRIPT.
 * 4. (Optional) Customize RECIPIENT_EMAIL below, or leave it blank to auto-email
 *    your own logged-in Google account without writing your email!
 *
 * 5. Click "Deploy" (top right) -> "New deployment":
 *    - Select type: "Web app"
 *    - Description: "OpenAPI Companion Feedback"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone" (Required so the extension can send data)
 *    - Click "Deploy", then "Authorize access".
 *
 * 6. Copy the "Web app URL" (looks like: https://script.google.com/macros/s/AKfycb.../exec)
 * 7. In your project root, create a file named `.env.local` and add:
 *    VITE_FEEDBACK_ENDPOINT=https://script.google.com/macros/s/YOUR_ID/exec
 *
 * That's it! Your real email is 100% hidden from Git and from extension users.
 * ============================================================================
 */

// If left blank, it automatically sends to your own Google account!
const RECIPIENT_EMAIL = "";

function doPost(e) {
  try {
    const rawData = e.postData ? e.postData.contents : "{}";
    const data = JSON.parse(rawData);

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const timestamp = new Date();
    const meta = data.metadata || {};

    // 1. Append row to Google Sheet
    sheet.appendRow([
      timestamp,
      data.type || "user_feedback",
      data.email || "anonymous",
      data.rating || "",
      data.category || "",
      data.message || "",
      meta.version || "",
      meta.browser || "",
      meta.os || "",
    ]);

    // 2. Send instant email notification to your Gmail
    const targetEmail = RECIPIENT_EMAIL || Session.getActiveUser().getEmail();
    if (targetEmail) {
      const subject =
        data.type === "install_lead"
          ? "[OpenAPI Companion] 🚀 New Install Lead: " + (data.email || "No email")
          : "[OpenAPI Companion] 💬 New Feedback (" +
            (data.rating ? data.rating + "★ " : "") +
            (data.category || "") +
            ")";

      const body = [
        "New submission received for OpenAPI Companion:",
        "",
        "Type: " + (data.type || "user_feedback"),
        "User Email: " + (data.email || "Not provided"),
        "Rating: " + (data.rating ? data.rating + "/5" : "N/A"),
        "Category: " + (data.category || "N/A"),
        "Message:\n" + (data.message || "(No message text)"),
        "",
        "--- Diagnostics ---",
        "Version: " + (meta.version || "N/A"),
        "Browser: " + (meta.browser || "N/A"),
        "OS: " + (meta.os || "N/A"),
        "Time: " + timestamp.toISOString(),
      ].join("\n");

      MailApp.sendEmail({
        to: targetEmail,
        subject: subject,
        body: body,
      });
    }

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, status: "success" })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "OpenAPI Companion Feedback Webhook is active" })
  ).setMimeType(ContentService.MimeType.JSON);
}
