const {
  getCompanyOverview,
  listCapabilities,
  listPublicResources,
  listServices,
  listServiceAreas,
  logAgentEvent,
  matchProjectScope,
  prepareProjectInquiry,
  readJsonResource,
  readTextResource,
  screenProcurementFit,
} = require("../lib/agent-public-data");
const { answerAgentQuestion } = require("../lib/agent-concierge");
const { setSecurityHeaders } = require("../lib/security-headers");

const CONTENT_SIGNAL = "ai-train=no, search=yes, ai-input=yes";
const MODERN_MCP_VERSION = "2026-07-28";
const LEGACY_MCP_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = {
  name: "strata-saudi-public-readonly",
  version: "2026.08.31",
  websiteUrl: "https://www.stratasaudi.com",
};
const SERVER_INSTRUCTIONS = "Use approved public Strata data only. Explain and prepare; never contact, submit, or disclose private information.";
const PUBLIC_CACHE_HINT = { ttlMs: 60 * 60 * 1000, cacheScope: "public" };

function sendJson(res, statusCode, payload, protocolVersion = "") {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Signal", CONTENT_SIGNAL);
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (protocolVersion) res.setHeader("MCP-Protocol-Version", protocolVersion);
  setSecurityHeaders(res, { cache: false });
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload, null, 2));
}

const MAX_BODY_BYTES = 16 * 1024;

async function readBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalBytes += buffer.length;
    if (totalBytes > MAX_BODY_BYTES) throw rpcError(-32602, "Invalid params: request body exceeds 16 KiB.");
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw rpcError(-32700, "Parse error.");
  }
}

function rpcError(code, message, options = {}) {
  const error = new Error(message);
  error.rpcCode = code;
  error.rpcData = options.data;
  error.httpStatusCode = options.httpStatusCode;
  return error;
}

function jsonRpcError(id, code, message, data) {
  const response = {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
  if (data !== undefined) response.error.data = data;
  return response;
}

function requestEnvelope(body) {
  return body && body.params && body.params._meta && typeof body.params._meta === "object"
    ? body.params._meta
    : {};
}

function requestEra(req, body) {
  const headerVersion = String(req.headers["mcp-protocol-version"] || "");
  const bodyVersion = String(requestEnvelope(body)["io.modelcontextprotocol/protocolVersion"] || "");
  if (headerVersion === MODERN_MCP_VERSION || bodyVersion === MODERN_MCP_VERSION) return "modern";
  if (
    (headerVersion && !LEGACY_MCP_VERSIONS.includes(headerVersion)) ||
    (bodyVersion && !LEGACY_MCP_VERSIONS.includes(bodyVersion))
  ) return "modern";
  return "legacy";
}

function mirroredRequestName(body) {
  if (!body || !body.params) return "";
  if (body.method === "tools/call" || body.method === "prompts/get") return String(body.params.name || "");
  if (body.method === "resources/read") return String(body.params.uri || "");
  return "";
}

function validateModernRequest(req, body) {
  const headerVersion = String(req.headers["mcp-protocol-version"] || "");
  const bodyVersion = String(requestEnvelope(body)["io.modelcontextprotocol/protocolVersion"] || "");
  if (headerVersion !== MODERN_MCP_VERSION || bodyVersion !== MODERN_MCP_VERSION) {
    throw rpcError(-32022, "Unsupported or missing MCP protocol version.", {
      httpStatusCode: 400,
      data: {
        supported: [MODERN_MCP_VERSION, ...LEGACY_MCP_VERSIONS],
      },
    });
  }

  const headerMethod = String(req.headers["mcp-method"] || "");
  const headerName = String(req.headers["mcp-name"] || "");
  const expectedName = mirroredRequestName(body);
  if (headerMethod !== body.method || (expectedName && headerName !== expectedName)) {
    throw rpcError(-32020, "MCP routing headers are missing or do not match the request body.", {
      httpStatusCode: 400,
    });
  }
}

function modernResult(result, options = {}) {
  return {
    resultType: "complete",
    ...result,
    ...(options.cache ? PUBLIC_CACHE_HINT : {}),
    _meta: {
      ...(result && result._meta ? result._meta : {}),
      "io.modelcontextprotocol/serverInfo": SERVER_INFO,
    },
  };
}

function toolDefinitions() {
  return [
    {
      name: "ask_strata_concierge",
      description: "Ask Strata's public-data-only mandate concierge a question. Raw questions are not logged or retained; no contact or submission action is available.",
      inputSchema: {
        type: "object",
        properties: {
          question: { type: "string", minLength: 1, maxLength: 4000 },
        },
        required: ["question"],
      },
    },
    {
      name: "get_company_overview",
      description: "Return Strata Risk Advisory public company overview, positioning, canonical URL, contact policy, and legal boundary.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_services",
      description: "List public Strata Risk Advisory service mandates and fit guidance.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "match_project_scope",
      description: "Classify whether a user-described matter appears to fit Strata's selective engineering-led advisory scope.",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string" },
          project_context: { type: "string" },
          matter_type: { type: "string" },
          request_type: { type: "string" },
          counterparty_type: { type: "string" },
          country: { type: "string" },
        },
      },
    },
    {
      name: "prepare_project_inquiry",
      description: "Prepare a draft inquiry package for user review. Does not submit or contact Strata.",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string" },
          project_context: { type: "string" },
          matter_type: { type: "string" },
          pressure_point: { type: "string" },
          decision_needed: { type: "string" },
          urgency: { type: "string" },
          confidentiality: { type: "string" },
        },
      },
    },
    {
      name: "screen_procurement_fit",
      description: "Screen whether a procurement or sourcing request fits Strata's engineering-led Saudi project-risk advisory mandate.",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string" },
          project_context: { type: "string" },
          buyer_type: { type: "string" },
          request_type: { type: "string" },
          country: { type: "string" },
          mandate_type: { type: "string" },
        },
      },
    },
    {
      name: "list_service_areas",
      description: "Return public service-area and fit/non-fit signals.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "read_public_resource",
      description: "Read a public Strata agent-readiness resource by id.",
      inputSchema: {
        type: "object",
        properties: {
          resource_id: {
            type: "string",
            enum: [
              "company",
              "services",
              "capabilities",
              "service-areas",
              "project-inquiry-schema",
              "agent-routing",
              "use-cases",
              "fit-matrix",
              "evidence-requirements",
              "fidic-risk-signals",
              "conversion-intelligence",
              "indexing-control",
              "authority-evidence",
              "procurement-readiness",
              "agent-concierge",
              "agent-question-taxonomy",
              "llms",
              "llms-full",
              "openapi",
              "agent-card",
              "mcp-server-card"
            ],
          },
        },
        required: ["resource_id"],
      },
    },
  ];
}

async function callTool(name, args, req) {
  await logAgentEvent("mcp_tool_call", {
    tool_name: name,
    user_agent: req.headers["user-agent"] || "",
    fit: "",
    path: "/api/mcp",
  });

  if (name === "ask_strata_concierge") {
    if (!args || typeof args.question !== "string" || !args.question.trim()) {
      throw rpcError(-32602, "Invalid params: question is required.");
    }
    let result;
    try {
      result = answerAgentQuestion({ question: args.question });
    } catch (error) {
      throw rpcError(-32602, `Invalid params: ${error.message}`);
    }
    await logAgentEvent("agent_question", {
      tool_name: name,
      fit: result.fit,
      user_agent: req.headers["user-agent"] || "",
      path: "/api/mcp",
      question_topic: result.question_topic,
      question_pattern: result.question_pattern,
      answer_status: result.answer_status,
      matched_service: result.matched_service,
      language: result.language,
      route: result.route,
      question_fingerprint: result.question_fingerprint,
    });
    return result;
  }
  if (name === "get_company_overview") return getCompanyOverview();
  if (name === "list_services") return listServices();
  if (name === "list_service_areas") return listServiceAreas();
  if (name === "match_project_scope") {
    const result = matchProjectScope(args || {});
    await logAgentEvent("inquiry_scope_match", {
      tool_name: name,
      fit: result.fit,
      user_agent: req.headers["user-agent"] || "",
      path: "/api/mcp",
    });
    return result;
  }
  if (name === "prepare_project_inquiry") {
    const result = prepareProjectInquiry(args || {});
    await logAgentEvent("inquiry_preparation", {
      tool_name: name,
      fit: result.match && result.match.fit,
      user_agent: req.headers["user-agent"] || "",
      path: "/api/mcp",
    });
    return result;
  }
  if (name === "screen_procurement_fit") {
    const result = screenProcurementFit(args || {});
    await logAgentEvent("procurement_fit_screen", {
      tool_name: name,
      fit: result.fit,
      user_agent: req.headers["user-agent"] || "",
      path: "/api/mcp",
    });
    return result;
  }
  if (name === "read_public_resource") {
    const resourceId = args && args.resource_id;
    if (!resourceId || typeof resourceId !== "string") {
      throw rpcError(-32602, "Invalid params: resource_id is required.");
    }
    await logAgentEvent("mcp_resource_read", {
      resource_id: resourceId,
      tool_name: name,
      user_agent: req.headers["user-agent"] || "",
      path: "/api/mcp",
    });
    const json = readJsonResource(resourceId);
    if (json) return json;
    const text = readTextResource(resourceId);
    if (text) return { resource_id: resourceId, text };
    throw rpcError(-32602, "Invalid params: unknown public resource.");
  }
  if (name === "list_capabilities") return listCapabilities();
  throw rpcError(-32602, "Invalid params: unknown tool.");
}

function asMcpContent(payload) {
  return [{ type: "text", text: JSON.stringify(payload, null, 2) }];
}

async function handleJsonRpc(body, req, era = "legacy") {
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.method !== "string") {
    throw rpcError(-32600, "Invalid Request.");
  }
  const id = Object.prototype.hasOwnProperty.call(body, "id") ? body.id : null;
  if (body.method === "initialize") {
    if (era === "modern") return jsonRpcError(id, -32601, "Method not found.");
    const requestedVersion = body.params && body.params.protocolVersion;
    const protocolVersion = LEGACY_MCP_VERSIONS.includes(requestedVersion)
      ? requestedVersion
      : LEGACY_MCP_VERSIONS[0];
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion,
        serverInfo: SERVER_INFO,
        capabilities: {
          tools: {},
          resources: {},
        },
        instructions: SERVER_INSTRUCTIONS,
      },
    };
  }

  if (body.method === "server/discover") {
    if (era !== "modern") return jsonRpcError(id, -32601, "Method not found.");
    return {
      jsonrpc: "2.0",
      id,
      result: modernResult({
        supportedVersions: [MODERN_MCP_VERSION],
        capabilities: { tools: {}, resources: {} },
        instructions: SERVER_INSTRUCTIONS,
      }, { cache: true }),
    };
  }

  if (body.method === "tools/list") {
    const result = { tools: toolDefinitions() };
    return { jsonrpc: "2.0", id, result: era === "modern" ? modernResult(result, { cache: true }) : result };
  }

  if (body.method === "tools/call") {
    const name = body.params && body.params.name;
    const args = (body.params && body.params.arguments) || {};
    if (!name || typeof name !== "string") {
      throw rpcError(-32602, "Invalid params: tool name is required.");
    }
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      throw rpcError(-32602, "Invalid params: arguments must be an object.");
    }
    const result = await callTool(name, args, req);
    const payload = { content: asMcpContent(result), isError: false };
    return { jsonrpc: "2.0", id, result: era === "modern" ? modernResult(payload) : payload };
  }

  if (body.method === "resources/list") {
    const result = {
      resources: require("../lib/agent-public-data").listPublicResources().map((resource) => ({
        uri: resource.uri,
        name: resource.id,
        mimeType: resource.path.endsWith(".txt") || resource.path.endsWith(".md") ? "text/plain" : "application/json",
      })),
    };
    return {
      jsonrpc: "2.0",
      id,
      result: era === "modern" ? modernResult(result, { cache: true }) : result,
    };
  }

  if (body.method === "resources/read") {
    const uri = body.params && body.params.uri;
    if (!uri || typeof uri !== "string") {
      throw rpcError(-32602, "Invalid params: resource uri is required.");
    }
    const resource = require("../lib/agent-public-data")
      .listPublicResources()
      .find((item) => item.uri === uri || item.path === uri || item.id === uri);
    if (!resource) throw rpcError(-32602, "Invalid params: unknown resource.");
    await logAgentEvent("mcp_resource_read", {
      resource_id: resource.id,
      user_agent: req.headers["user-agent"] || "",
      path: "/api/mcp",
    });
    const text = readTextResource(resource.id);
    const result = {
      contents: [
        {
          uri: resource.uri,
          mimeType: resource.path.endsWith(".txt") || resource.path.endsWith(".md") ? "text/plain" : "application/json",
          text,
        },
      ],
    };
    return {
      jsonrpc: "2.0",
      id,
      result: era === "modern" ? modernResult(result, { cache: true }) : result,
    };
  }

  return jsonRpcError(id, -32601, "Method not found.");
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name");
  res.setHeader("Access-Control-Expose-Headers", "MCP-Protocol-Version, Content-Signal");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === "GET") {
      await logAgentEvent("mcp_discovery_read", {
        user_agent: req.headers["user-agent"] || "",
        path: "/api/mcp",
      });
      sendJson(res, 200, {
        name: "Strata Saudi Public Read-Only MCP",
        description: "Read-only public MCP endpoint for Strata Risk Advisory. It prepares inquiry drafts only and never submits contact without explicit user approval.",
        tools: toolDefinitions(),
        resources: require("../lib/agent-public-data").listPublicResources(),
        policy: {
          read_only: true,
          approval_required_before_contact_or_submission: true,
          non_fit_routing_enforced: true,
        },
      });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "Method not allowed." });
      return;
    }

    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      sendJson(res, 415, { ok: false, error: "Content-Type must be application/json." });
      return;
    }

    let body;
    let id = null;
    let era = "legacy";
    try {
      body = await readBody(req);
      id = body && Object.prototype.hasOwnProperty.call(body, "id") ? body.id : null;
      era = requestEra(req, body);
      if (era === "modern") validateModernRequest(req, body);
      sendJson(
        res,
        200,
        await handleJsonRpc(body, req, era),
        era === "modern" ? MODERN_MCP_VERSION : "",
      );
    } catch (error) {
      const statusCode = error && error.httpStatusCode ? error.httpStatusCode : 200;
      sendJson(
        res,
        statusCode,
        jsonRpcError(
          id,
          error && error.rpcCode ? error.rpcCode : -32000,
          error && error.message ? error.message : "MCP request failed.",
          error && error.rpcData,
        ),
        era === "modern" ? MODERN_MCP_VERSION : "",
      );
    }
  } catch (error) {
    sendJson(res, 200, jsonRpcError(null, -32000, error && error.message ? error.message : "MCP request failed."));
  }
};
