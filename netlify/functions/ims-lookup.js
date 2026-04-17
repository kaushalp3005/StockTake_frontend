"use strict";

/**
 * ims-lookup.js — Netlify serverless function (thin proxy)
 *
 * Proxies box QR-code lookups to the StockTake backend so that
 * the client-side app doesn't need to know the backend URL.
 *
 * POST  /.netlify/functions/ims-lookup
 * Body: { "box_id": "...", "txn_no": "..." }   (mirrors QR code JSON)
 *       OR { "raw_qr": "{\"box_id\":\"...\",\"txn_no\":\"...\"}" }
 *
 * Requires:
 *   BACKEND_API_URL  — e.g. https://ogj0f6xitg.execute-api.ap-south-1.amazonaws.com/prod
 *   Forwarded header: Authorization: Bearer <jwt>
 */

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  // Support raw_qr (full JSON string) or explicit box_id + txn_no
  let boxId = (body.box_id || body.boxId || "").toString().trim();
  let txnNo = (body.txn_no  || body.txnNo  || "").toString().trim();

  if (!boxId && body.raw_qr) {
    try {
      const qr = JSON.parse(body.raw_qr);
      boxId = (qr.box_id || qr.boxId || "").toString().trim();
      txnNo = (qr.txn_no  || qr.txnNo  || qr.transaction_no || "").toString().trim();
    } catch {}
  }

  if (!boxId) {
    return { statusCode: 400, body: JSON.stringify({ error: "box_id is required" }) };
  }

  const backendUrl = (process.env.BACKEND_API_URL || "").replace(/\/$/, "");
  if (!backendUrl) {
    return {
      statusCode: 503,
      body: JSON.stringify({
        error: "BACKEND_API_URL is not set in Netlify environment variables.",
      }),
    };
  }

  // Forward the auth token so the backend authMiddleware accepts the request
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";

  const qs = new URLSearchParams({ box_id: boxId });
  if (txnNo) qs.set("txn_no", txnNo);

  try {
    const res = await fetch(`${backendUrl}/api/boxes/lookup?${qs.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    const data = await res.json().catch(() => ({}));
    return { statusCode: res.status, body: JSON.stringify(data) };
  } catch (err) {
    console.error("[ims-lookup] Backend call failed:", err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Could not reach StockTake backend. Please try manual entry." }),
    };
  }
};
