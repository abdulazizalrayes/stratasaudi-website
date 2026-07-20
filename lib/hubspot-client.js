function sanitize(value, maxLength) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength || 4000);
}

function sanitizeBoolean(value) {
  return value === true || value === "true";
}

function getHubSpotConfig() {
  return {
    token: sanitize(process.env.HUBSPOT_PRIVATE_APP_TOKEN, 255),
    portalId: sanitize(process.env.HUBSPOT_PORTAL_ID, 255),
    defaultBrand: sanitize(process.env.HUBSPOT_DEFAULT_BRAND, 255) || "strata_saudi",
    brandProperty: sanitize(process.env.HUBSPOT_BRAND_PROPERTY, 255) || "serving_brand",
    originBrandProperty:
      sanitize(process.env.HUBSPOT_ORIGIN_BRAND_PROPERTY, 255) || "origin_brand",
    sharedClientProperty:
      sanitize(process.env.HUBSPOT_SHARED_CLIENT_PROPERTY, 255) || "shared_client_flag",
    pipelineId: sanitize(process.env.HUBSPOT_PIPELINE_ID, 255),
    stageNew: sanitize(process.env.HUBSPOT_STAGE_NEW, 255),
    contactOwnerId: sanitize(process.env.HUBSPOT_CONTACT_OWNER_ID, 255),
    multiBrandPortal: sanitizeBoolean(process.env.HUBSPOT_MULTI_BRAND_PORTAL),
  };
}

function hasHubSpotConfig() {
  const config = getHubSpotConfig();
  return Boolean(config.token);
}

const propertyCache = new Map();

async function hubspotRequest(path, options = {}) {
  const config = getHubSpotConfig();
  if (!config.token) {
    throw new Error("HubSpot private app token is not configured.");
  }

  const response = await fetch(`https://api.hubapi.com${path}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const err = new Error(`HubSpot request failed with status ${response.status}`);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function getKnownPropertyNames(objectType) {
  if (propertyCache.has(objectType)) return propertyCache.get(objectType);

  try {
    const response = await hubspotRequest(`/crm/v3/properties/${objectType}`);
    const propertyNames = new Set((response.results || []).map((item) => item.name));
    propertyCache.set(objectType, propertyNames);
    return propertyNames;
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function filterKnownProperties(objectType, properties) {
  const knownProperties = await getKnownPropertyNames(objectType);
  if (!knownProperties) return properties;

  return Object.fromEntries(
    Object.entries(properties).filter(([key]) => knownProperties.has(key)),
  );
}

function splitName(fullName) {
  const clean = sanitize(fullName, 255);
  if (!clean) return { firstname: "", lastname: "" };
  const parts = clean.split(/\s+/).filter(Boolean);
  return {
    firstname: parts[0] || "",
    lastname: parts.slice(1).join(" ") || "",
  };
}

function mapContactProperties(payload) {
  const config = getHubSpotConfig();
  const { firstname, lastname } = splitName(payload.name);
  return {
    email: payload.email,
    firstname,
    lastname,
    jobtitle: payload.role || "",
    company: payload.company || "",
    country: payload.country || "",
    hs_lead_status: "NEW",
    hs_language: "en",
    [config.brandProperty]: config.defaultBrand,
    [config.originBrandProperty]: config.defaultBrand,
    [config.sharedClientProperty]: "false",
    mandate_type: payload.mandateType || "",
    counterparty_type: payload.counterpartyType || "",
    project_stage: payload.projectStage || "",
    project_value_band: payload.projectValueBand || "",
    urgency: payload.urgency || "",
    confidentiality_required: payload.confidentialityRequired ? "true" : "false",
    conflict_check_acknowledged: payload.conflictCheckAcknowledged ? "true" : "false",
    strata_lead_score: String(payload.leadScore || 0),
    lead_source: payload.leadSource || "website_confidential_enquiry",
    source_page_url: payload.pageUrl || "",
    enquiry_referrer: payload.referrer || "",
    first_touch_source: payload.firstTouch?.source || "",
    latest_touch_source: payload.latestTouch?.source || "",
    hs_lead_description: payload.message || "",
    ...(config.contactOwnerId ? { hubspot_owner_id: config.contactOwnerId } : {}),
  };
}

function mapDealProperties(payload) {
  const config = getHubSpotConfig();
  return {
    dealname: `Strata Saudi - ${payload.company} - ${payload.mandateType || "mandate"}`,
    pipeline: config.pipelineId || "",
    dealstage: config.stageNew || "",
    [config.brandProperty]: config.defaultBrand,
    [config.originBrandProperty]: config.defaultBrand,
    [config.sharedClientProperty]: "false",
    mandate_type: payload.mandateType || "",
    counterparty_type: payload.counterpartyType || "",
    project_stage: payload.projectStage || "",
    project_value_band: payload.projectValueBand || "",
    urgency: payload.urgency || "",
    confidentiality_required: payload.confidentialityRequired ? "true" : "false",
    conflict_check_acknowledged: payload.conflictCheckAcknowledged ? "true" : "false",
    strata_lead_score: String(payload.leadScore || 0),
    lead_source: payload.leadSource || "website_confidential_enquiry",
    source_page_url: payload.pageUrl || "",
    enquiry_referrer: payload.referrer || "",
    enquiry_context: payload.message || "",
  };
}

async function findContactByEmail(email) {
  const normalized = sanitize(email, 255).toLowerCase();
  if (!normalized) return null;

  const result = await hubspotRequest("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [{ propertyName: "email", operator: "EQ", value: normalized }],
        },
      ],
      limit: 1,
      properties: ["email", "firstname", "lastname", "company"],
    }),
  });

  return result.results && result.results.length > 0 ? result.results[0] : null;
}

async function upsertContact(payload) {
  const properties = await filterKnownProperties("contacts", mapContactProperties(payload));
  const existing = await findContactByEmail(payload.email);

  if (existing) {
    const updated = await hubspotRequest(`/crm/v3/objects/contacts/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
    return { action: "updated", record: updated };
  }

  const created = await hubspotRequest("/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({ properties }),
  });
  return { action: "created", record: created };
}

async function createDeal(payload) {
  const config = getHubSpotConfig();
  if (!config.pipelineId || !config.stageNew) {
    return { skipped: true, reason: "HubSpot pipeline or stage is not configured." };
  }

  const created = await hubspotRequest("/crm/v3/objects/deals", {
    method: "POST",
    body: JSON.stringify({
      properties: await filterKnownProperties("deals", mapDealProperties(payload)),
    }),
  });

  return { skipped: false, record: created };
}

async function syncLeadToHubSpot(payload) {
  const contact = await upsertContact(payload);
  const deal = await createDeal(payload);

  return {
    ok: true,
    contact: {
      action: contact.action,
      id: contact.record.id,
    },
    deal: deal.skipped
      ? { skipped: true, reason: deal.reason }
      : { skipped: false, id: deal.record.id },
  };
}

module.exports = {
  getHubSpotConfig,
  hasHubSpotConfig,
  syncLeadToHubSpot,
};
