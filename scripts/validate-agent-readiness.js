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
  ".well-known/agent-card.json",
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
  "/llms.txt",
  "/llms-full.txt",
  "/.well-known/agent-card.json",
  "/.well-known/api-catalog",
  "/.well-known/mcp.json",
  "/.well-known/mcp/server-card.json",
  "/.well-known/mcp/server-cards.json",
  "/.well-known/agent-skills/index.json",
  "/.well-known/oauth-protected-resource",
  "/openapi.json",
  "/auth.md",
  "/api/mcp",
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
  expect(
    routing.default_policy.includes("must not submit"),
    "routing: no-contact-without-approval rule missing",
  );
  expect(
    inquiry.approval_required_before_submission === true,
    "inquiry schema: approval gate missing",
  );
  expect(
    agentCard.agent_use.requires_explicit_user_approval.includes("Submitting a contact form"),
    "agent card: submission approval rule missing",
  );
  expect(agentCard.version, "agent card: A2A version missing");
  expect(
    Array.isArray(agentCard.supportedInterfaces) && agentCard.supportedInterfaces.length > 0,
    "agent card: supportedInterfaces missing",
  );
  expect(Array.isArray(agentCard.skills) && agentCard.skills.length > 0, "agent card: skills missing");
  expect(Array.isArray(agentCard.capabilities) && agentCard.capabilities.length > 0, "agent card: capabilities missing");
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
  expect(/^# .*auth\.md/im.test(read("auth.md")), "auth.md: H1 heading must contain auth.md");
  expect(read("auth.md").includes("## Agent Registration"), "auth.md: agent registration section missing");
  expect(read("auth.md").includes("Register URI:"), "auth.md: register URI marker missing");
  expect(read("auth.md").includes("\"agent_auth\""), "auth.md: agent_auth marker missing");
  expect(read("auth.md").includes("## Step 3 - Register"), "auth.md: registration step missing");
  expect(robots.includes("ai-input=yes"), "robots: ai-input=yes missing");
  expect(robots.includes("Disallow: /api/contact"), "robots: /api/contact should be disallowed for crawlers");
  expect(robots.includes("MCP: https://www.stratasaudi.com/.well-known/mcp.json"), "robots: MCP pointer missing");
  expect(openapi.paths["/data/fit-matrix.json"], "openapi: fit matrix endpoint missing");
  expect(openapi.paths["/data/fidic-risk-signals.json"], "openapi: FIDIC risk signals endpoint missing");
  expect(openapi.paths["/data/authority-evidence.json"], "openapi: authority evidence endpoint missing");
  expect(openapi.paths["/data/procurement-readiness.json"], "openapi: procurement readiness endpoint missing");
}

function validateMcpImplementation() {
  const mcpSource = read("api/mcp.js");
  for (const toolName of [
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
  expect(
    read("lib/agent-public-data.js").includes("strata_agent_readiness_event"),
    "lib/agent-public-data.js: privacy-safe analytics event name missing",
  );
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
