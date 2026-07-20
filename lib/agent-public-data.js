const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_ORIGIN = "https://www.stratasaudi.com";

const PUBLIC_RESOURCES = {
  "company": "/data/company.json",
  "services": "/data/services.json",
  "capabilities": "/data/capabilities.json",
  "service-areas": "/data/service-areas.json",
  "project-inquiry-schema": "/data/project-inquiry-schema.json",
  "agent-routing": "/data/agent-routing.json",
  "use-cases": "/data/use-cases.json",
  "fit-matrix": "/data/fit-matrix.json",
  "evidence-requirements": "/data/evidence-requirements.json",
  "fidic-risk-signals": "/data/fidic-risk-signals.json",
  "conversion-intelligence": "/data/conversion-intelligence.json",
  "indexing-control": "/data/indexing-control.json",
  "authority-evidence": "/data/authority-evidence.json",
  "procurement-readiness": "/data/procurement-readiness.json",
  "llms": "/llms.txt",
  "llms-full": "/llms-full.txt",
  "openapi": "/openapi.json",
  "agent-card": "/.well-known/agent-card.json",
  "mcp-server-card": "/.well-known/mcp/server-card.json",
};

const RESOURCE_FILES = Object.fromEntries(
  Object.entries(PUBLIC_RESOURCES).map(([key, publicPath]) => [
    key,
    path.join(ROOT, publicPath.replace(/^\//, "")),
  ]),
);

const JSON_RESOURCES = {
  "company": require("../data/company.json"),
  "services": require("../data/services.json"),
  "capabilities": require("../data/capabilities.json"),
  "service-areas": require("../data/service-areas.json"),
  "project-inquiry-schema": require("../data/project-inquiry-schema.json"),
  "agent-routing": require("../data/agent-routing.json"),
  "use-cases": require("../data/use-cases.json"),
  "fit-matrix": require("../data/fit-matrix.json"),
  "evidence-requirements": require("../data/evidence-requirements.json"),
  "fidic-risk-signals": require("../data/fidic-risk-signals.json"),
  "conversion-intelligence": require("../data/conversion-intelligence.json"),
  "indexing-control": require("../data/indexing-control.json"),
  "authority-evidence": require("../data/authority-evidence.json"),
  "procurement-readiness": require("../data/procurement-readiness.json"),
  "agent-card": require("../.well-known/agent-card.json"),
  "mcp-server-card": require("../.well-known/mcp/server-card.json"),
  "openapi": require("../openapi.json"),
};

function readTextResource(resourceId) {
  if (JSON_RESOURCES[resourceId]) return JSON.stringify(JSON_RESOURCES[resourceId], null, 2);
  const filePath = RESOURCE_FILES[resourceId];
  if (!filePath) return null;
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return null;
  }
}

function readJsonResource(resourceId) {
  if (JSON_RESOURCES[resourceId]) return JSON_RESOURCES[resourceId];
  const text = readTextResource(resourceId);
  if (!text) return null;
  return JSON.parse(text);
}

function publicUrl(publicPath) {
  return `${SITE_ORIGIN}${publicPath}`;
}

function listPublicResources() {
  return Object.entries(PUBLIC_RESOURCES).map(([id, publicPath]) => ({
    id,
    uri: publicUrl(publicPath),
    path: publicPath,
  }));
}

function getCompanyOverview() {
  return readJsonResource("company");
}

function listServices() {
  return readJsonResource("services");
}

function listServiceAreas() {
  return readJsonResource("service-areas");
}

function listCapabilities() {
  return readJsonResource("capabilities");
}

function getAuthorityEvidence() {
  return readJsonResource("authority-evidence");
}

function getProcurementReadiness() {
  return readJsonResource("procurement-readiness");
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function screenProcurementFit(input = {}) {
  const text = normalizeText(
    [
      input.description,
      input.project_context,
      input.buyer_type,
      input.request_type,
      input.country,
      input.mandate_type,
    ].join(" "),
  );
  const procurement = getProcurementReadiness();
  const scope = matchProjectScope(input);

  const nonFitSignals = [];
  if (includesAny(text, ["marketplace", "vendor portal", "supplier registration", "commodity", "staffing supply"])) {
    nonFitSignals.push("commodity_or_marketplace_procurement");
  }
  if (includesAny(text, ["lawyer", "legal representation", "arbitration counsel", "litigation counsel", "counsel of record"])) {
    nonFitSignals.push("legal_representation");
  }
  if (includesAny(text, ["career", "job", "internship", "training", "course", "retail", "consumer", "backlink", "guest post"])) {
    nonFitSignals.push("non_mandate_request");
  }

  if (scope.fit === "not_fit" || nonFitSignals.length > 0) {
    return {
      fit: "not_fit",
      procurement_category: procurement.supplier_profile.category,
      reasons: nonFitSignals.length ? nonFitSignals : scope.reasons,
      recommendation: "Do not route to project inquiry. Provide the non-fit explanation and avoid collecting contact details.",
      approval_required_before_submission: true,
      safe_next_step: "If the user believes the matter is a Saudi project-risk mandate, ask for high-level project context only.",
    };
  }

  const strongProcurementSignals = includesAny(text, [
    "epc",
    "developer",
    "board",
    "headquarters",
    "investment committee",
    "law firm",
    "saudi",
    "fidic",
    "delay",
    "variation",
    "pre-litigation",
    "technical opinion",
    "risk review",
  ]);

  return {
    fit: scope.fit === "strong_fit" || strongProcurementSignals ? "procurement_fit" : "possible_procurement_fit",
    procurement_category: procurement.supplier_profile.category,
    supplier_profile: procurement.supplier_profile,
    qualification_questions: procurement.qualification_questions,
    safe_initial_information_to_collect: procurement.safe_initial_information_to_collect,
    do_not_collect_publicly: procurement.do_not_collect_publicly,
    approval_required_before_submission: true,
    recommendation:
      scope.fit === "strong_fit" || strongProcurementSignals
        ? "Prepare a procurement-fit summary or inquiry draft for user review only."
        : "Ask for Saudi project exposure, buyer type, and mandate type before preparing an inquiry draft.",
    related_scope_match: scope,
  };
}

function matchProjectScope(input = {}) {
  const text = normalizeText(
    [
      input.description,
      input.project_context,
      input.matter_type,
      input.counterparty_type,
      input.country,
      input.project_stage,
    ].join(" "),
  );
  const services = listServices();
  const routing = readJsonResource("agent-routing");

  const nonFit = [];
  if (includesAny(text, ["career", "job", "internship", "cv", "resume", "hiring"])) {
    nonFit.push("careers_jobs_internships");
  }
  if (includesAny(text, ["training", "course", "workshop", "certificate"])) {
    nonFit.push("training_courses");
  }
  if (includesAny(text, ["vendor", "supplier", "reseller", "sell you", "partnership pitch"])) {
    nonFit.push("vendors_suppliers_resellers");
  }
  if (includesAny(text, ["lawyer", "legal representation", "represent me", "arbitration counsel", "litigation counsel"])) {
    nonFit.push("legal_representation");
  }
  if (includesAny(text, ["consumer", "retail", "refund", "personal dispute", "shopping"])) {
    nonFit.push("consumer_or_retail");
  }
  if (includesAny(text, ["backlink", "guest post", "link exchange", "seo package"])) {
    nonFit.push("seo_backlinks_spam");
  }

  if (nonFit.length > 0) {
    return {
      fit: "not_fit",
      score: 0,
      reasons: nonFit,
      recommendation: "Do not route to the project inquiry form.",
      routing_policy: routing.route_away_from_project_inquiry_when.filter((rule) =>
        nonFit.includes(rule.category),
      ),
      approval_required_before_submission: true,
    };
  }

  const serviceScores = services.services.map((service) => {
    let score = 0;
    const haystack = normalizeText(
      [
        service.id,
        service.name,
        service.summary,
        service.best_for.join(" "),
        service.typical_inputs.join(" "),
        service.typical_outputs.join(" "),
      ].join(" "),
    );
    for (const token of text.split(/[^a-z0-9_]+/).filter(Boolean)) {
      if (token.length > 3 && haystack.includes(token)) score += 1;
    }
    if (text.includes(service.id)) score += 5;
    return { id: service.id, name: service.name, score };
  }).sort((a, b) => b.score - a.score);

  let fitScore = 20;
  if (includesAny(text, ["saudi", "ksa", "riyadh", "jeddah", "neom", "giga", "vision 2030"])) fitScore += 25;
  if (includesAny(text, ["epc", "contractor", "developer", "law firm", "board", "investment committee"])) fitScore += 20;
  if (includesAny(text, ["fidic", "delay", "variation", "notice", "claim", "dispute", "pre-litigation", "technical opinion"])) fitScore += 25;
  if (includesAny(text, ["sar", "million", "high-value", "confidential", "sensitive"])) fitScore += 10;

  const bestMatches = serviceScores.filter((service) => service.score > 0).slice(0, 3);

  return {
    fit: fitScore >= 65 ? "strong_fit" : fitScore >= 40 ? "possible_fit" : "information_only",
    score: Math.min(fitScore, 100),
    matched_services: bestMatches.length ? bestMatches : serviceScores.slice(0, 2),
    recommendation:
      fitScore >= 40
        ? "Prepare an inquiry draft for user review; do not submit without explicit approval."
        : "Provide information first and ask for Saudi project context before preparing an inquiry.",
    approval_required_before_submission: true,
  };
}

function prepareProjectInquiry(input = {}) {
  const match = matchProjectScope(input);
  if (match.fit === "not_fit") {
    return {
      ready_for_review: false,
      route: "non_fit",
      match,
      message: "This request should not be routed to the Strata project inquiry form.",
    };
  }

  return {
    ready_for_review: true,
    route: "project_inquiry_preparation",
    approval_required_before_submission: true,
    submission_policy:
      "This is a draft only. Agents must not submit it, email it, book a meeting, or trigger CRM actions unless the user explicitly approves the final submission.",
    canonical_submission_url: `${SITE_ORIGIN}/contact`,
    match,
    draft: {
      counterpartyType: input.counterpartyType || input.counterparty_type || "",
      mandateType: input.mandateType || input.matter_type || "",
      projectStage: input.projectStage || input.project_stage || "",
      projectValueBand: input.projectValueBand || input.project_value_band || "",
      urgency: input.urgency || "",
      message_outline: [
        "Saudi project context:",
        input.project_context || input.description || "",
        "Technical/commercial pressure point:",
        input.pressure_point || "",
        "Decision needed:",
        input.decision_needed || "",
        "Urgency and confidentiality constraints:",
        input.confidentiality || "",
      ],
      required_before_submission: [
        "Name",
        "Business email",
        "Company",
        "Country",
        "Counterparty type",
        "Mandate type",
        "Project context",
        "Conflict and fit check acknowledgement",
      ],
    },
  };
}

function logAgentEvent(eventType, details = {}) {
  const safeDetails = {
    resource_id: details.resource_id || "",
    tool_name: details.tool_name || "",
    fit: details.fit || "",
    user_agent: details.user_agent || "",
    path: details.path || "",
  };
  console.info("strata_agent_readiness_event", {
    event_type: eventType,
    at: new Date().toISOString(),
    ...safeDetails,
  });
}

module.exports = {
  SITE_ORIGIN,
  PUBLIC_RESOURCES,
  getCompanyOverview,
  listCapabilities,
  listPublicResources,
  listServices,
  listServiceAreas,
  getAuthorityEvidence,
  getProcurementReadiness,
  logAgentEvent,
  matchProjectScope,
  prepareProjectInquiry,
  publicUrl,
  readJsonResource,
  readTextResource,
  screenProcurementFit,
};
