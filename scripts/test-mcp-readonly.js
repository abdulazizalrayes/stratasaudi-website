#!/usr/bin/env node

const { Readable } = require("stream");
const handler = require("../api/mcp");
const {
  matchProjectScope,
  prepareProjectInquiry,
  screenProcurementFit,
} = require("../lib/agent-public-data");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function callMcp(rawBody, extraHeaders = {}) {
  const req = Readable.from([rawBody]);
  req.method = "POST";
  req.headers = {
    "content-type": "application/json",
    "user-agent": "strata-mcp-readonly-test",
    ...extraHeaders,
  };

  return new Promise((resolve, reject) => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
      end(body) {
        try {
          resolve({
            statusCode: this.statusCode,
            headers,
            body: JSON.parse(body),
          });
        } catch (error) {
          reject(error);
        }
      },
    };

    handler(req, res).catch(reject);
  });
}

async function expectRpcError(name, rawBody, expectedCode) {
  const response = await callMcp(rawBody);
  expect(response.statusCode === 200, `${name}: expected HTTP 200`);
  expect(response.body.error?.code === expectedCode, `${name}: expected JSON-RPC ${expectedCode}`);
}

async function main() {
  await expectRpcError("parse error", "{", -32700);
  await expectRpcError("invalid request", JSON.stringify({ jsonrpc: "2.0", id: 1 }), -32600);
  await expectRpcError(
    "unknown method",
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "unknown/method" }),
    -32601,
  );
  await expectRpcError(
    "missing tool name",
    JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {} }),
    -32602,
  );

  const legacyInitialize = await callMcp(JSON.stringify({
    jsonrpc: "2.0",
    id: "legacy-init",
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "strata-test", version: "1.0.0" },
    },
  }));
  expect(
    legacyInitialize.body.result?.protocolVersion === "2025-11-25",
    "legacy initialize must preserve a supported client version",
  );

  const modernMeta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "strata-test", version: "1.0.0" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
  const modernHeaders = {
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": "server/discover",
  };
  const modernDiscovery = await callMcp(JSON.stringify({
    jsonrpc: "2.0",
    id: "modern-discover",
    method: "server/discover",
    params: { _meta: modernMeta },
  }), modernHeaders);
  expect(modernDiscovery.statusCode === 200, "modern discovery must return HTTP 200");
  expect(
    modernDiscovery.body.result?.supportedVersions?.includes("2026-07-28"),
    "modern discovery must advertise MCP 2026-07-28",
  );
  expect(
    modernDiscovery.body.result?._meta?.["io.modelcontextprotocol/serverInfo"]?.name === "strata-saudi-public-readonly",
    "modern discovery must stamp server identity in result metadata",
  );
  expect(modernDiscovery.body.result?.resultType === "complete", "modern discovery must declare a complete result");

  const modernTools = await callMcp(JSON.stringify({
    jsonrpc: "2.0",
    id: "modern-tools",
    method: "tools/list",
    params: { _meta: modernMeta },
  }), {
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": "tools/list",
  });
  expect(modernTools.body.result?.resultType === "complete", "modern tools/list must declare a complete result");
  expect(modernTools.body.result?.tools?.length >= 8, "modern tools/list must expose the public tool catalog");

  const headerMismatch = await callMcp(JSON.stringify({
    jsonrpc: "2.0",
    id: "modern-mismatch",
    method: "tools/call",
    params: {
      name: "get_company_overview",
      arguments: {},
      _meta: modernMeta,
    },
  }), {
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": "tools/call",
    "mcp-name": "list_services",
  });
  expect(headerMismatch.statusCode === 400, "modern routing mismatch must return HTTP 400");
  expect(headerMismatch.body.error?.code === -32020, "modern routing mismatch must return JSON-RPC -32020");
  await expectRpcError(
    "unknown resource",
    JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      method: "resources/read",
      params: { uri: "resource://strata/not-real" },
    }),
    -32602,
  );

  const careerMatch = matchProjectScope({ request_type: "careers and internships" });
  expect(careerMatch.fit === "not_fit", "careers must be classified as not fit");

  const careerInquiry = prepareProjectInquiry({ request_type: "careers and internships" });
  expect(!careerInquiry.ready_for_review, "careers must not produce an inquiry draft");
  expect(careerInquiry.route === "non_fit", "careers must route away from project inquiry");

  const unrelatedInquiry = prepareProjectInquiry({ description: "birthday party planning" });
  expect(!unrelatedInquiry.ready_for_review, "unrelated requests must not produce an inquiry draft");
  expect(unrelatedInquiry.route === "information_only", "unrelated requests must remain information only");

  const procurement = screenProcurementFit({ request_type: "vendor portal registration" });
  expect(procurement.fit === "not_fit", "vendor registration must not route to project inquiry");

  const qualifiedInquiry = prepareProjectInquiry({
    description: "Confidential delay and variation risk review",
    project_context: "High-value Saudi EPC project under a FIDIC-based contract",
    matter_type: "pre-litigation technical opinion",
  });
  expect(qualifiedInquiry.ready_for_review, "qualified Saudi project-risk matters should produce a draft");
  expect(
    qualifiedInquiry.approval_required_before_submission,
    "qualified drafts must retain explicit approval requirements",
  );

  const conciergeResponse = await callMcp(JSON.stringify({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "ask_strata_concierge",
      arguments: { question: "Why should a Saudi EPC contractor consider Strata?" },
    },
  }));
  expect(conciergeResponse.body.result?.isError === false, "concierge MCP tool should succeed");
  const conciergePayload = JSON.parse(conciergeResponse.body.result.content[0].text);
  expect(conciergePayload.question_pattern === "why_strata", "concierge MCP pattern mismatch");
  expect(conciergePayload.raw_question_stored === false, "concierge MCP must not store raw questions");

  console.log(
    JSON.stringify(
      {
        ok: true,
        protocolErrorsChecked: [-32700, -32600, -32601, -32602],
        protocolVersionsChecked: ["2025-11-25", "2026-07-28"],
        modernRoutingHeadersChecked: true,
        nonFitRoutesChecked: ["careers", "internships", "vendors", "unrelated"],
        qualifiedDraftChecked: true,
        conciergeToolChecked: true,
        submissionRemainsDisabled: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
