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

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload, null, 2));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw rpcError(-32700, "Parse error.");
  }
}

function rpcError(code, message) {
  const error = new Error(message);
  error.rpcCode = code;
  return error;
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
}

function toolDefinitions() {
  return [
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

function callTool(name, args, req) {
  logAgentEvent("mcp_tool_call", {
    tool_name: name,
    user_agent: req.headers["user-agent"] || "",
    fit: "",
    path: "/api/mcp",
  });

  if (name === "get_company_overview") return getCompanyOverview();
  if (name === "list_services") return listServices();
  if (name === "list_service_areas") return listServiceAreas();
  if (name === "match_project_scope") {
    const result = matchProjectScope(args || {});
    logAgentEvent("inquiry_scope_match", {
      tool_name: name,
      fit: result.fit,
      user_agent: req.headers["user-agent"] || "",
      path: "/api/mcp",
    });
    return result;
  }
  if (name === "prepare_project_inquiry") {
    const result = prepareProjectInquiry(args || {});
    logAgentEvent("inquiry_preparation", {
      tool_name: name,
      fit: result.match && result.match.fit,
      user_agent: req.headers["user-agent"] || "",
      path: "/api/mcp",
    });
    return result;
  }
  if (name === "screen_procurement_fit") {
    const result = screenProcurementFit(args || {});
    logAgentEvent("procurement_fit_screen", {
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
    logAgentEvent("mcp_resource_read", {
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

function handleJsonRpc(body, req) {
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.method !== "string") {
    throw rpcError(-32600, "Invalid Request.");
  }
  const id = Object.prototype.hasOwnProperty.call(body, "id") ? body.id : null;
  if (body.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "strata-saudi-public-readonly",
          version: "2026.06.20",
        },
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    };
  }

  if (body.method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: toolDefinitions() } };
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
    const result = callTool(name, args, req);
    return { jsonrpc: "2.0", id, result: { content: asMcpContent(result), isError: false } };
  }

  if (body.method === "resources/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        resources: require("../lib/agent-public-data").listPublicResources().map((resource) => ({
          uri: resource.uri,
          name: resource.id,
          mimeType: resource.path.endsWith(".txt") || resource.path.endsWith(".md") ? "text/plain" : "application/json",
        })),
      },
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
    logAgentEvent("mcp_resource_read", {
      resource_id: resource.id,
      user_agent: req.headers["user-agent"] || "",
      path: "/api/mcp",
    });
    const text = readTextResource(resource.id);
    return {
      jsonrpc: "2.0",
      id,
      result: {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.path.endsWith(".txt") || resource.path.endsWith(".md") ? "text/plain" : "application/json",
            text,
          },
        ],
      },
    };
  }

  return jsonRpcError(id, -32601, "Method not found.");
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === "GET") {
      logAgentEvent("mcp_discovery_read", {
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

    let body;
    let id = null;
    try {
      body = await readBody(req);
      id = body && Object.prototype.hasOwnProperty.call(body, "id") ? body.id : null;
      sendJson(res, 200, handleJsonRpc(body, req));
    } catch (error) {
      sendJson(res, 200, jsonRpcError(
        id,
        error && error.rpcCode ? error.rpcCode : -32000,
        error && error.message ? error.message : "MCP request failed.",
      ));
    }
  } catch (error) {
    sendJson(res, 200, jsonRpcError(null, -32000, error && error.message ? error.message : "MCP request failed."));
  }
};
