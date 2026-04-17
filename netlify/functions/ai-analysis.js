"use strict";
// Netlify function: AI analysis of stocktake data
// Uses Anthropic Claude API. Env var: ANTHROPIC_API_KEY
// Model: claude-sonnet-4-6 (claude-sonnet-4-20250514)

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 200, body: JSON.stringify({ analysis: "AI analysis requires ANTHROPIC_API_KEY environment variable to be configured." }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { totalEntries, totalWeight, verifiedPct, floorsCovered, topItems, freshWeight, offgradeWeight, dateFilter } = payload;

  const prompt = `You are a warehouse stocktake analyst. Analyze the following stocktake data and provide:
1. A 1-paragraph summary of the overall stocktake
2. Key discrepancies or concerns (if any)
3. Three actionable recommendations
4. A data quality note

Stocktake Data:
- Total entries: ${totalEntries}
- Total weight: ${totalWeight?.toFixed(2)} kg
- Verified: ${verifiedPct?.toFixed(1)}%
- Floors covered: ${floorsCovered}
- Fresh stock weight: ${freshWeight?.toFixed(2)} kg
- Off grade/rejection weight: ${offgradeWeight?.toFixed(2)} kg
- Date filter: ${dateFilter || "All dates"}
- Top items by weight: ${topItems?.map((i) => `${i.name} (${i.weight?.toFixed(1)} kg)`).join(", ") || "N/A"}

Keep your response concise and practical. Use plain text, no markdown headers.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 500, body: JSON.stringify({ error: `API error: ${err}` }) };
    }

    const data = await response.json();
    const analysis = data.content?.[0]?.text || "No analysis generated.";
    return { statusCode: 200, body: JSON.stringify({ analysis }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Unknown error" }) };
  }
};
