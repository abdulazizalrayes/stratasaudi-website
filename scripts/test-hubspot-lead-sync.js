#!/usr/bin/env node

const { loadLocalEnv } = require("../lib/load-local-env");
const { hasHubSpotConfig, syncLeadToHubSpot } = require("../lib/hubspot-client");

loadLocalEnv();

function buildPayload() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    name: "Strata Test Lead",
    email: `strata-test-${stamp}@example.com`,
    role: "Board Advisor",
    company: "Strata Test Counterparty",
    country: "Saudi Arabia",
    mandateType: "pre_contract_risk_review",
    counterpartyType: "investor",
    projectStage: "pre_contract",
    projectValueBand: "500m_plus",
    urgency: "this_month",
    confidentialityRequired: true,
    conflictCheckAcknowledged: true,
    leadScore: 88,
    leadSource: "system_test",
    pageUrl: "https://www.stratasaudi.com/contact",
    referrer: "https://www.stratasaudi.com",
    message: "System verification lead for HubSpot sync.",
    firstTouch: { source: "direct" },
    latestTouch: { source: "direct" },
  };
}

async function main() {
  if (!hasHubSpotConfig()) {
    throw new Error("HubSpot private app token is not configured.");
  }

  const result = await syncLeadToHubSpot(buildPayload());
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error.message,
        body: error.body || null,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
