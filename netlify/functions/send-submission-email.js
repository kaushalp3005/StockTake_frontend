"use strict";

// Netlify serverless function — send stocktake submission notification email
// Runtime: Node.js (CommonJS)
// Dependency: @sendgrid/mail  (install in frontend: npm i @sendgrid/mail)
// Env vars required:
//   SENDGRID_API_KEY   — SendGrid API key (function is skipped gracefully if absent)
//   SENDGRID_FROM_EMAIL — sender address (default: noreply@stocktake.app)

const sgMail = require("@sendgrid/mail");

/**
 * Build a plain HTML email body for a floor submission.
 */
function buildHtml({ floorName, warehouse, submittedBy, entryCount, totalWeight, date }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>StockTake Submission</title>
  <style>
    body  { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .wrap { max-width: 560px; margin: 32px auto; background: #ffffff;
            border-radius: 6px; overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .header { background: #1d4ed8; padding: 24px 32px; }
    .header h1 { color: #ffffff; margin: 0; font-size: 20px; }
    .body   { padding: 28px 32px; }
    .body p { color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 12px; }
    table   { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td  { text-align: left; padding: 10px 14px; font-size: 14px; }
    th      { background: #f3f4f6; color: #6b7280; font-weight: 600;
              text-transform: uppercase; font-size: 12px; letter-spacing: .5px; }
    td      { color: #111827; border-top: 1px solid #e5e7eb; }
    .footer { background: #f9fafb; padding: 16px 32px;
              font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>StockTake — Floor Submission</h1>
    </div>
    <div class="body">
      <p>A floor stocktake has been submitted and is ready for review.</p>
      <table>
        <tr><th>Field</th><th>Value</th></tr>
        <tr><td>Floor</td><td>${escHtml(floorName)}</td></tr>
        <tr><td>Warehouse</td><td>${escHtml(warehouse)}</td></tr>
        <tr><td>Submitted by</td><td>${escHtml(submittedBy)}</td></tr>
        <tr><td>Date</td><td>${escHtml(date)}</td></tr>
        <tr><td>Entries submitted</td><td>${Number(entryCount).toLocaleString()}</td></tr>
        <tr><td>Total weight (kg)</td><td>${Number(totalWeight).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
      </table>
    </div>
    <div class="footer">
      This is an automated notification from the StockTake system. Do not reply to this email.
    </div>
  </div>
</body>
</html>
`.trim();
}

/** Minimal HTML escaping for user-supplied strings. */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

exports.handler = async function handler(event) {
  // Only accept POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { Allow: "POST" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // Graceful skip when SendGrid key is absent (avoids breaking the app in dev/staging)
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn(
      "[send-submission-email] SENDGRID_API_KEY is not set — skipping email send."
    );
    return {
      statusCode: 200,
      body: JSON.stringify({ skipped: true }),
    };
  }

  // Parse request body
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const {
    floorName,
    warehouse,
    entryCount,
    totalWeight,
    submittedBy,
    submittedByEmail,
    date,
    managerEmail,
  } = payload;

  // Validate required fields
  const missing = [
    "floorName",
    "warehouse",
    "entryCount",
    "totalWeight",
    "submittedBy",
    "date",
    "managerEmail",
  ].filter((k) => payload[k] === undefined || payload[k] === null || payload[k] === "");

  if (missing.length > 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Missing required fields: ${missing.join(", ")}` }),
    };
  }

  const fromEmail =
    process.env.SENDGRID_FROM_EMAIL || "noreply@stocktake.app";

  const subject = `[StockTake] Floor submission \u2014 ${floorName}, ${warehouse} (${date})`;

  // Build recipient list — always notify the manager; CC the submitter if email provided
  const toAddresses = [managerEmail];

  const msg = {
    to: toAddresses,
    from: fromEmail,
    subject,
    html: buildHtml({ floorName, warehouse, submittedBy, entryCount, totalWeight, date }),
    // Plain-text fallback
    text: [
      `StockTake — Floor Submission`,
      ``,
      `Floor:            ${floorName}`,
      `Warehouse:        ${warehouse}`,
      `Submitted by:     ${submittedBy}`,
      `Date:             ${date}`,
      `Entries submitted:${entryCount}`,
      `Total weight (kg):${Number(totalWeight).toFixed(2)}`,
      ``,
      `This is an automated notification from the StockTake system.`,
    ].join("\n"),
  };

  // Optionally CC the submitter when their email is available
  if (submittedByEmail) {
    msg.cc = submittedByEmail;
  }

  try {
    sgMail.setApiKey(apiKey);
    await sgMail.send(msg);

    console.info(
      `[send-submission-email] Email sent to ${managerEmail} for ${floorName}/${warehouse} submitted by ${submittedBy}`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    const message =
      err?.response?.body?.errors?.[0]?.message ||
      err?.message ||
      "Unknown error";

    console.error("[send-submission-email] SendGrid error:", message);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: message }),
    };
  }
};
