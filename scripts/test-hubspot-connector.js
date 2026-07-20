#!/usr/bin/env node

const { loadLocalEnv } = require("../lib/load-local-env");
const { getHubSpotConfig, hasHubSpotConfig } = require("../lib/hubspot-client");

loadLocalEnv();

async function main() {
  if (!hasHubSpotConfig()) {
    throw new Error("HubSpot private app token is not configured.");
  }

  const config = getHubSpotConfig();
  const response = await fetch("https://api.hubapi.com/account-info/v3/details", {
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HubSpot connectivity check failed with status ${response.status}: ${JSON.stringify(body)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        portalId: body.portalId || config.portalId || null,
        timeZone: body.timeZone || null,
        companyName: body.companyName || null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
