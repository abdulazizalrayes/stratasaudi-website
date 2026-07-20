#!/usr/bin/env node

const { loadLocalEnv } = require("../lib/load-local-env");
const { getHubSpotConfig } = require("../lib/hubspot-client");
const schema = require("../ops/crm/pipeline-schema.json");

loadLocalEnv();

const ENUMS = {
  serving_brand: {
    label: "Serving Brand",
    type: "enumeration",
    fieldType: "select",
    options: [{ label: "Strata Saudi", value: "strata_saudi", displayOrder: 0 }],
  },
  origin_brand: {
    label: "Origin Brand",
    type: "enumeration",
    fieldType: "select",
    options: [{ label: "Strata Saudi", value: "strata_saudi", displayOrder: 0 }],
  },
  shared_client_flag: {
    label: "Shared Client Flag",
    type: "bool",
    fieldType: "booleancheckbox",
  },
  mandate_type: {
    label: "Mandate Type",
    type: "enumeration",
    fieldType: "select",
    options: [
      "pre_contract_risk_review",
      "project_risk_oversight",
      "pre_litigation_advisory",
      "technical_opinion",
      "vendor_risk_assessment",
      "board_risk_briefing",
    ].map((value, index) => ({
      label: value.replace(/_/g, " "),
      value,
      displayOrder: index,
    })),
  },
  counterparty_type: {
    label: "Counterparty Type",
    type: "enumeration",
    fieldType: "select",
    options: ["epc", "developer", "law_firm", "investor", "board", "other"].map((value, index) => ({
      label: value.replace(/_/g, " "),
      value,
      displayOrder: index,
    })),
  },
  project_stage: {
    label: "Project Stage",
    type: "enumeration",
    fieldType: "select",
    options: ["pre_contract", "mobilization", "delivery", "delay", "dispute"].map((value, index) => ({
      label: value.replace(/_/g, " "),
      value,
      displayOrder: index,
    })),
  },
  project_value_band: {
    label: "Project Value Band",
    type: "enumeration",
    fieldType: "select",
    options: ["under_50m", "50m_250m", "250m_500m", "500m_plus"].map((value, index) => ({
      label: value.replace(/_/g, " "),
      value,
      displayOrder: index,
    })),
  },
  urgency: {
    label: "Urgency",
    type: "enumeration",
    fieldType: "select",
    options: ["immediate", "this_month", "this_quarter", "monitoring"].map((value, index) => ({
      label: value.replace(/_/g, " "),
      value,
      displayOrder: index,
    })),
  },
  confidentiality_required: {
    label: "Confidentiality Required",
    type: "bool",
    fieldType: "booleancheckbox",
  },
  conflict_check_acknowledged: {
    label: "Conflict Check Acknowledged",
    type: "bool",
    fieldType: "booleancheckbox",
  },
  strata_lead_score: {
    label: "Strata Lead Score",
    type: "number",
    fieldType: "number",
  },
  lead_source: {
    label: "Lead Source",
    type: "string",
    fieldType: "text",
  },
};

async function request(path, options = {}) {
  const { token } = getHubSpotConfig();
  if (!token) throw new Error("HubSpot private app token is not configured.");

  const response = await fetch(`https://api.hubapi.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`HubSpot request failed with status ${response.status}`);
    error.body = body;
    throw error;
  }
  return body;
}

function buildProperty(name) {
  const definition = ENUMS[name] || {
    label: name
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    type: "string",
    fieldType: "text",
  };

  return {
    groupName: "contactinformation",
    name,
    label: definition.label,
    type: definition.type,
    fieldType: definition.fieldType,
    formField: false,
    ...(definition.options ? { options: definition.options } : {}),
  };
}

async function ensureProperties(objectType, groupName, names) {
  const existing = await request(`/crm/v3/properties/${objectType}`);
  const existingNames = new Set((existing.results || []).map((item) => item.name));
  const created = [];

  for (const name of names) {
    if (existingNames.has(name)) continue;
    const property = buildProperty(name);
    property.groupName = groupName;
    await request(`/crm/v3/properties/${objectType}`, {
      method: "POST",
      body: JSON.stringify(property),
    });
    created.push(name);
  }

  return created;
}

async function main() {
  const contactCreated = await ensureProperties(
    "contacts",
    "contactinformation",
    schema.requiredProperties.contacts,
  );
  const dealCreated = await ensureProperties(
    "deals",
    "dealinformation",
    schema.requiredProperties.deals,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        contactsCreated: contactCreated,
        dealsCreated: dealCreated,
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
        body: error.body || null,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
