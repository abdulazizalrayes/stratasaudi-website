#!/usr/bin/env node

const assert = require("assert");

const { classifyUserAgent, recordAgentEvent } = require("../lib/agent-observability");
const publicResourceHandler = require("../api/public-resource");

function responseHarness() {
  const headers = {};
  let body = "";
  return {
    res: {
      statusCode: 200,
      setHeader(name, value) {
        headers[String(name).toLowerCase()] = value;
      },
      end(value = "") {
        body += Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
      },
    },
    headers,
    get body() {
      return body;
    },
  };
}

async function main() {
  assert.strictEqual(classifyUserAgent("OAI-SearchBot/1.0"), "openai");
  assert.strictEqual(classifyUserAgent("Claude-SearchBot"), "anthropic");
  assert.strictEqual(classifyUserAgent("PerplexityBot"), "perplexity");
  assert.strictEqual(classifyUserAgent("Mozilla/5.0"), "browser_or_unknown_agent");

  const originalFetch = global.fetch;
  const originalMeasurementId = process.env.GA_MEASUREMENT_ID;
  const originalSecret = process.env.GA_API_SECRET;
  const originalVercelEnv = process.env.VERCEL_ENV;
  let outboundBody = "";
  process.env.GA_MEASUREMENT_ID = "G-TEST";
  process.env.GA_API_SECRET = "test-secret";
  process.env.VERCEL_ENV = "production";
  global.fetch = async (_url, options) => {
    outboundBody = options.body;
    return { ok: true };
  };

  await recordAgentEvent("agent_resource_read", {
    user_agent: "OAI-SearchBot/1.0 private-token",
    resource_type: "agent_discovery",
    resource_path: "/llms.txt",
    representation: "text/plain",
  });
  const outbound = JSON.parse(outboundBody);
  const serialized = JSON.stringify(outbound);
  assert(serialized.includes("openai"), "aggregated agent family missing");
  assert(!serialized.includes("private-token"), "raw user agent leaked to persistent analytics");
  assert(!serialized.includes("OAI-SearchBot"), "raw user agent leaked to persistent analytics");

  const get = responseHarness();
  await publicResourceHandler({ method: "GET", url: "/llms.txt", headers: { "user-agent": "OAI-SearchBot" } }, get.res);
  assert.strictEqual(get.res.statusCode, 200);
  assert.strictEqual(get.headers["content-type"], "text/plain; charset=utf-8");
  assert.strictEqual(get.headers["content-signal"], "ai-train=no, search=yes, ai-input=yes");
  assert.strictEqual(get.headers["access-control-allow-origin"], "*");
  assert(get.headers.etag, "public resource ETag missing");
  assert(get.body.includes("Strata Risk Advisory"), "llms.txt body missing");

  const head = responseHarness();
  await publicResourceHandler({ method: "HEAD", url: "/data/company.json", headers: {} }, head.res);
  assert.strictEqual(head.res.statusCode, 200);
  assert.strictEqual(head.body, "");
  assert.strictEqual(head.headers["content-type"], "application/json; charset=utf-8");

  const unknown = responseHarness();
  await publicResourceHandler({ method: "GET", url: "/data/private.json", headers: {} }, unknown.res);
  assert.strictEqual(unknown.res.statusCode, 404);

  global.fetch = originalFetch;
  if (originalMeasurementId === undefined) delete process.env.GA_MEASUREMENT_ID;
  else process.env.GA_MEASUREMENT_ID = originalMeasurementId;
  if (originalSecret === undefined) delete process.env.GA_API_SECRET;
  else process.env.GA_API_SECRET = originalSecret;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;

  console.log(JSON.stringify({
    ok: true,
    privacySafeFamilies: true,
    persistentGa4Event: true,
    publicResourceReadsChecked: 3,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
