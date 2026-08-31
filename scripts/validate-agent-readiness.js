const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_ORIGIN = "https://www.stratasaudi.com";

const REQUIRED_JSON_FILES = [
  "data/company.json",
  "data/services.json",
  "data/capabilities.json",
  "data/service-areas.json",
  "data/project-inquiry-schema.json",
  "data/agent-routing.json",
  "data/use-cases.json",
  "data/fit-matrix.json",
  "data/evidence-requirements.json",
  "data/fidic-risk-signals.json",
  "data/conversion-intelligence.json",
  "data/indexing-control.json",
  "data/authority-evidence.json",
  "data/procurement-readiness.json",
  "data/agent-concierge.json",
  "data/agent-question-taxonomy.json",
  ".well-known/agent-card.json",
  ".well-known/ai-catalog.json",
  ".well-known/mcp.json",
  ".well-known/mcp/server-card.json",
  ".well-known/mcp/server-cards.json",
  ".well-known/agent-skills/index.json",
  ".well-known/oauth-protected-resource",
  "openapi.json",
];

const REQUIRED_TEXT_FILES = [
  "llms.txt",
  "llms-full.txt",
  ".well-known/api-catalog",
  "auth.md",
  "robots.txt",
];

const REQUIRED_ENDPOINTS = [
  "/data/company.json",
  "/data/services.json",
  "/data/capabilities.json",
  "/data/service-areas.json",
  "/data/project-inquiry-schema.json",
  "/data/agent-routing.json",
  "/data/use-cases.json",
  "/data/fit-matrix.json",
  "/data/evidence-requirements.json",
  "/data/fidic-risk-signals.json",
  "/data/conversion-intelligence.json",
  "/data/indexing-control.json",
  "/data/authority-evidence.json",
  "/data/procurement-readiness.json",
  "/data/agent-concierge.json",
  "/data/agent-question-taxonomy.json",
  "/llms.txt",
  "/llms-full.txt",
  "/.well-known/agent-card.json",
  "/.well-known/ai-catalog.json",
  "/.well-known/api-catalog",
  "/.well-known/mcp.json",
  "/.well-known/mcp/server-card.json",
  "/.well-known/mcp/server-cards.json",
  "/.well-known/agent-skills/index.json",
  "/.well-known/oauth-protected-resource",
  "/openapi.json",
  "/auth.md",
  "/api/mcp",
  "/api/a2a",
  "/api/a2a/message:send",
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function fail(message) {
  throw new Error(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function parseJson(relativePath) {
  try {
    return JSON.parse(read(relativePath));
  } catch (error) {
    fail(`${relativePath}: invalid JSON - ${error.message}`);
  }
}

function assertCanonicalOnly(relativePath, content) {
  expect(
    !content.includes("stratasaudi-website-qgjqqrtfy-abdulazizalrayes-3914s-projects.vercel.app"),
    `${relativePath}: prohibited Vercel preview URL found`,
  );
  expect(!content.includes("https://stratasaudi.com"), `${relativePath}: bare domain URL found`);
}

function validateFiles() {
  for (const file of REQUIRED_JSON_FILES) {
    const parsed = parseJson(file);
    assertCanonicalOnly(file, JSON.stringify(parsed));
  }

  for (const file of REQUIRED_TEXT_FILES) {
    const content = read(file);
    assertCanonicalOnly(file, content);
  }
}

function validateBusinessRules() {
  const company = parseJson("data/company.json");
  const routing = parseJson("data/agent-routing.json");
  const inquiry = parseJson("data/project-inquiry-schema.json");
  const agentCard = parseJson(".well-known/agent-card.json");
  const aiCatalog = parseJson(".well-known/ai-catalog.json");
  const oauthProtectedResource = parseJson(".well-known/oauth-protected-resource");
  const openapi = parseJson("openapi.json");
  const conversion = parseJson("data/conversion-intelligence.json");
  const authority = parseJson("data/authority-evidence.json");
  const procurement = parseJson("data/procurement-readiness.json");

  expect(company.legal_boundary && company.legal_boundary.not_a_law_firm === true, "company: legal boundary missing");
  expect(
    JSON.stringify(company).includes("advisory@stratasaudi.com"),
    "company: approved business mailbox missing",
  );
  expect(company.canonical_contact.telephone === "+966500067865", "company: approved mobile missing");
  expect(
    company.canonical_contact.whatsapp ===
      "https://wa.me/966500067865?text=Hello%20Strata%20Risk%20Advisory.%20I%20am%20contacting%20you%20through%20the%20Strata%20Saudi%20website%20regarding%20an%20enquiry.",
    "company: approved WhatsApp link or message differs",
  );
  expect(
    routing.default_policy.includes("must not submit"),
    "routing: no-contact-without-approval rule missing",
  );
  expect(
    inquiry.approval_required_before_submission === true,
    "inquiry schema: approval gate missing",
  );
  expect(
    agentCard.agentUse.requiresExplicitUserApproval.includes("Submitting a contact form"),
    "agent card: submission approval rule missing",
  );
  expect(
    agentCard.agentUse.requiresExplicitUserApproval.includes("Placing a call or opening WhatsApp"),
    "agent card: phone and WhatsApp approval rule missing",
  );
  expect(agentCard.version, "agent card: agent version missing");
  expect(
    Array.isArray(agentCard.supportedInterfaces) && agentCard.supportedInterfaces.length > 0,
    "agent card: supportedInterfaces missing",
  );
  expect(Array.isArray(agentCard.skills) && agentCard.skills.length > 0, "agent card: skills missing");
  expect(agentCard.capabilities && agentCard.capabilities.streaming === false, "agent card: A2A capabilities missing");
  expect(agentCard.supportedInterfaces[0].protocolBinding === "HTTP+JSON", "agent card: A2A HTTP+JSON binding missing");
  expect(agentCard.supportedInterfaces[0].protocolVersion === "1.0", "agent card: A2A v1.0 missing");
  expect(agentCard.supportedInterfaces[0].url === `${SITE_ORIGIN}/api/a2a`, "agent card: canonical A2A endpoint missing");
  expect(Array.isArray(agentCard.defaultInputModes) && agentCard.defaultInputModes.includes("text/plain"), "agent card: text input mode missing");
  expect(agentCard.privacy.rawQuestionsLogged === false, "agent card: raw-question privacy rule missing");
  const concierge = parseJson("data/agent-concierge.json");
  const questionTaxonomy = parseJson("data/agent-question-taxonomy.json");
  expect(concierge.security_boundary.model_or_external_ai_provider_enabled === false, "concierge: external model must remain disabled");
  expect(concierge.security_boundary.private_system_access === false, "concierge: private-system access must remain disabled");
  expect(concierge.security_boundary.contact_or_submission_actions === false, "concierge: contact actions must remain disabled");
  expect(concierge.privacy_safe_question_intelligence.raw_questions_logged === false, "concierge: raw-question logging must remain disabled");
  expect(questionTaxonomy.privacy_policy.raw_questions_stored === false, "question taxonomy: raw-question storage must remain disabled");
  expect(aiCatalog.specVersion === "1.0", "ARD catalog: unsupported specVersion");
  expect(Array.isArray(aiCatalog.entries) && aiCatalog.entries.length >= 3, "ARD catalog: entries missing");
  for (const entry of aiCatalog.entries) {
    expect(/^urn:air:stratasaudi\.com:/.test(entry.identifier), "ARD catalog: Strata domain-anchored identifier missing");
    expect(Boolean(entry.url) !== Boolean(entry.data), "ARD catalog: each entry must use exactly one of url or data");
    expect(Array.isArray(entry.representativeQueries) && entry.representativeQueries.length >= 2, "ARD catalog: representative queries missing");
  }
  expect(
    oauthProtectedResource.authentication_required === false,
    "oauth protected resource: public read-only no-auth policy missing",
  );
  expect(
    Array.isArray(oauthProtectedResource.authorization_servers),
    "oauth protected resource: authorization_servers array missing",
  );
  expect(
    openapi.paths["/api/contact"].post["x-agent-approval-required"] === true,
    "openapi: contact approval extension missing",
  );
  expect(
    conversion.privacy_rules.some((rule) => rule.includes("Do not log names")),
    "conversion intelligence: privacy-safe logging rule missing",
  );
  expect(authority.authority_position.not_a_law_firm === true, "authority evidence: legal boundary missing");
  expect(
    authority.confidential_evidence_policy.client_names.includes("Not published"),
    "authority evidence: confidentiality policy missing",
  );
  expect(
    procurement.routing_policy.before_user_approval.includes("inquiry draft only"),
    "procurement readiness: approval-gated routing missing",
  );
  expect(
    procurement.procurement_fit.not_fit.some((item) => item.includes("Legal representation")),
    "procurement readiness: legal non-fit rule missing",
  );
}

function validateDiscovery() {
  const llms = read("llms.txt");
  const llmsFull = read("llms-full.txt");
  const robots = read("robots.txt");
  const openapi = parseJson("openapi.json");
  const mcpCard = parseJson(".well-known/mcp/server-card.json");
  const mcpDiscovery = parseJson(".well-known/mcp.json");
  const serverCards = parseJson(".well-known/mcp/server-cards.json");
  const agentCard = parseJson(".well-known/agent-card.json");
  const aiCatalog = parseJson(".well-known/ai-catalog.json");
  const apiCatalogText = read(".well-known/api-catalog");
  const apiCatalog = JSON.parse(apiCatalogText);
  const vercel = read("vercel.json");

  for (const endpoint of REQUIRED_ENDPOINTS) {
    const absolute = `${SITE_ORIGIN}${endpoint}`;
    const mentioned =
      llms.includes(absolute) ||
      llmsFull.includes(absolute) ||
      JSON.stringify(openapi).includes(endpoint) ||
      JSON.stringify(mcpCard).includes(absolute) ||
      JSON.stringify(mcpDiscovery).includes(absolute) ||
      JSON.stringify(serverCards).includes(absolute) ||
      JSON.stringify(agentCard).includes(absolute) ||
      JSON.stringify(aiCatalog).includes(absolute) ||
      apiCatalogText.includes(endpoint) ||
      vercel.includes(endpoint.replace(/^\//, ""));
    expect(mentioned, `discovery: ${endpoint} is not referenced by discovery/config files`);
  }

  expect(Array.isArray(apiCatalog.linkset) && apiCatalog.linkset.length > 0, "api catalog: linkset array missing");
  expect(
    apiCatalog.linkset.some((entry) => Array.isArray(entry["service-desc"]) && entry["service-desc"].length > 0),
    "api catalog: service-desc relation missing",
  );
  expect(
    apiCatalog.linkset.some((entry) => Array.isArray(entry["service-doc"]) && entry["service-doc"].length > 0),
    "api catalog: service-doc relation missing",
  );
  expect(vercel.includes("application/linkset+json"), "vercel: API catalog content type should be linkset JSON");
  expect(robots.includes(`Agentmap: ${SITE_ORIGIN}/.well-known/ai-catalog.json`), "robots: ARD Agentmap directive missing");
  expect(llms.includes(`${SITE_ORIGIN}/.well-known/ai-catalog.json`), "llms: ARD catalog pointer missing");
  expect(/^# .*auth\.md/im.test(read("auth.md")), "auth.md: H1 heading must contain auth.md");
  expect(read("auth.md").includes("## Agent Registration"), "auth.md: agent registration section missing");
  expect(read("auth.md").includes("Register URI:"), "auth.md: register URI marker missing");
  expect(read("auth.md").includes("\"agent_auth\""), "auth.md: agent_auth marker missing");
  expect(read("auth.md").includes("## Step 3 - Register"), "auth.md: registration step missing");
  expect(robots.includes("ai-input=yes"), "robots: ai-input=yes missing");
  expect(robots.includes("ai-train=no"), "robots: ai-train=no missing");
  expect(robots.includes("Disallow: /api/contact"), "robots: /api/contact should be disallowed for crawlers");
  expect(robots.includes("Disallow: /api/a2a"), "robots: /api/a2a should be disallowed for indexing crawlers");
  expect(robots.includes("User-agent: GPTBot\nDisallow: /"), "robots: GPTBot training opt-out missing");
  expect(robots.includes("User-agent: ClaudeBot\nDisallow: /"), "robots: ClaudeBot training opt-out missing");
  expect(robots.includes("User-agent: OAI-SearchBot\nAllow: /"), "robots: OAI search access missing");
  expect(robots.includes("User-agent: Claude-SearchBot\nAllow: /"), "robots: Claude search access missing");
  expect(
    llms.includes("https://www.stratasaudi.com/.well-known/mcp.json") ||
      JSON.stringify(mcpDiscovery).includes("https://www.stratasaudi.com/api/mcp"),
    "discovery: MCP pointer missing from standards-appropriate resources",
  );
  expect(openapi.paths["/data/fit-matrix.json"], "openapi: fit matrix endpoint missing");
  expect(openapi.paths["/data/fidic-risk-signals.json"], "openapi: FIDIC risk signals endpoint missing");
  expect(openapi.paths["/data/authority-evidence.json"], "openapi: authority evidence endpoint missing");
  expect(openapi.paths["/data/procurement-readiness.json"], "openapi: procurement readiness endpoint missing");
}

function validateMcpImplementation() {
  const mcpSource = read("api/mcp.js");
  for (const toolName of [
    "ask_strata_concierge",
    "get_company_overview",
    "list_services",
    "match_project_scope",
    "prepare_project_inquiry",
    "screen_procurement_fit",
    "list_service_areas",
    "read_public_resource",
  ]) {
    expect(mcpSource.includes(toolName), `api/mcp.js: ${toolName} missing`);
  }
  expect(mcpSource.includes("approval_required_before_contact_or_submission"), "api/mcp.js: approval policy missing");
  expect(mcpSource.includes("logAgentEvent"), "api/mcp.js: privacy-safe analytics hook missing");
  expect(mcpSource.includes("-32700"), "api/mcp.js: malformed JSON parse-error handling missing");
  expect(mcpSource.includes("-32602"), "api/mcp.js: invalid-params handling missing");
  expect(mcpSource.includes("-32601"), "api/mcp.js: method-not-found handling missing");
  expect(mcpSource.includes("MAX_BODY_BYTES"), "api/mcp.js: request-body limit missing");
  expect(mcpSource.includes('MODERN_MCP_VERSION = "2026-07-28"'), "api/mcp.js: modern MCP version missing");
  expect(mcpSource.includes("server/discover"), "api/mcp.js: modern MCP discovery missing");
  expect(mcpSource.includes("mcp-protocol-version"), "api/mcp.js: modern MCP version-header validation missing");
  expect(mcpSource.includes("mcp-method"), "api/mcp.js: modern MCP method-header validation missing");
  expect(mcpSource.includes("mcp-name"), "api/mcp.js: modern MCP name-header validation missing");
  expect(mcpSource.includes("-32020"), "api/mcp.js: modern MCP header-mismatch error missing");
  expect(mcpSource.includes("-32022"), "api/mcp.js: modern MCP version-mismatch error missing");
  expect(
    mcpSource.includes('"io.modelcontextprotocol/serverInfo"'),
    "api/mcp.js: modern MCP server identity metadata missing",
  );
  const a2aSource = read("api/a2a.js");
  expect(a2aSource.includes('const A2A_VERSION = "1.0"'), "api/a2a.js: A2A v1.0 missing");
  expect(a2aSource.includes("MAX_BODY_BYTES"), "api/a2a.js: request-body limit missing");
  expect(a2aSource.includes("Only text parts are accepted"), "api/a2a.js: file and URL rejection missing");
  expect(!a2aSource.includes("OPENAI_API_KEY"), "api/a2a.js: external model key must not be used in phase one");
  expect(
    read("lib/agent-observability.js").includes("strata_agent_readiness_event"),
    "lib/agent-observability.js: privacy-safe analytics event name missing",
  );
  const productionReport = read("scripts/report-agent-production.js");
  expect(productionReport.includes("EXPECTED_PROJECT"), "production agent report: Vercel identity lock missing");
  expect(productionReport.includes("raw_logs_persisted_by_this_script: false"), "production agent report: raw-log policy missing");
}

function main() {
  validateFiles();
  validateBusinessRules();
  validateDiscovery();
  validateMcpImplementation();

  console.log(
    JSON.stringify(
      {
        ok: true,
        message: "Agent readiness validation passed.",
        jsonFilesChecked: REQUIRED_JSON_FILES.length,
        textFilesChecked: REQUIRED_TEXT_FILES.length,
        endpointsChecked: REQUIRED_ENDPOINTS.length,
      },
      null,
      2,
    ),
  );
}

main();
