#!/usr/bin/env node

const endpoint = process.env.CONTACT_SMOKE_ENDPOINT || "https://www.stratasaudi.com/api/contact";
const stamp = new Date().toISOString();

const payload = {
  name: "Strata Contact Smoke Test",
  email: "advisory@stratasaudi.com",
  role: "Internal diagnostic",
  company: "Strata Risk Advisory",
  country: "Saudi Arabia",
  counterpartyType: "other",
  mandateType: "technical_opinion",
  projectStage: "live_project",
  projectValueBand: "under_50m",
  urgency: "monitoring",
  message: `Internal website contact-intake smoke test at ${stamp}. No external prospect action required.`,
  confidentialityRequired: false,
  conflictCheckAcknowledged: true,
  leadSource: "internal_smoke_test",
  pageUrl: "https://www.stratasaudi.com/contact",
  referrer: "https://www.stratasaudi.com/contact",
  sessionId: `contact-smoke-${Date.now()}`,
};

async function main() {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://www.stratasaudi.com",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_error) {}

  if (!response.ok || !body || body.ok !== true) {
    throw new Error(`Contact smoke test failed with HTTP ${response.status}: ${text}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        endpoint,
        status: response.status,
        message: body.message,
        leadScore: body.leadScore,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
