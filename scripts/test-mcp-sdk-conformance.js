#!/usr/bin/env node

const http = require("http");

const handler = require("../api/mcp");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function main() {
  const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    });
  });
  const address = await listen(server);
  const endpoint = new URL(`http://127.0.0.1:${address.port}/api/mcp`);
  const clients = [];

  try {
    const modernClient = new Client(
      { name: "strata-mcp-conformance", version: "1.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    clients.push(modernClient);
    await modernClient.connect(new StreamableHTTPClientTransport(endpoint));
    expect(modernClient.getProtocolEra() === "modern", "official SDK must negotiate the modern MCP era");
    expect(
      modernClient.getServerVersion()?.name === "strata-saudi-public-readonly",
      "official SDK must read the modern server identity",
    );

    const modernTools = await modernClient.listTools();
    expect(modernTools.tools.some((tool) => tool.name === "ask_strata_concierge"), "modern client must list the concierge tool");
    const modernCall = await modernClient.callTool({
      name: "ask_strata_concierge",
      arguments: { question: "What services does Strata provide?" },
    });
    const modernPayload = JSON.parse(modernCall.content[0].text);
    expect(modernPayload.question_pattern === "services_overview", "modern tool call returned the wrong answer pattern");

    const legacyClient = new Client(
      { name: "strata-mcp-legacy-conformance", version: "1.0.0" },
      { versionNegotiation: { mode: "legacy" } },
    );
    clients.push(legacyClient);
    await legacyClient.connect(new StreamableHTTPClientTransport(endpoint));
    expect(legacyClient.getProtocolEra() === "legacy", "official SDK legacy mode must remain supported");
    const legacyTools = await legacyClient.listTools();
    expect(legacyTools.tools.length === modernTools.tools.length, "legacy and modern tool catalogs must remain aligned");

    console.log(JSON.stringify({
      ok: true,
      officialSdk: "@modelcontextprotocol/client",
      modernVersion: "2026-07-28",
      modernPinnedConnection: true,
      legacyConnection: true,
      toolCatalogAligned: true,
      conciergeToolCalled: true,
    }, null, 2));
  } finally {
    await Promise.all(clients.map((client) => client.close().catch(() => {})));
    await close(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
