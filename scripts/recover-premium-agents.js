#!/usr/bin/env node

const { loadLocalEnv } = require("../lib/load-local-env");
const { getPaperclipBaseUrl } = require("./lib/paperclip-base-url");

loadLocalEnv();

const BASE_URL = getPaperclipBaseUrl();
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "9ff6f561-3790-444f-87c8-89cb0911775b";
const PAPERCLIP_EXECUTION_CWD =
  process.env.PAPERCLIP_EXECUTION_CWD ||
  process.env.STRATA_PAPERCLIP_EXECUTION_CWD ||
  "/home/paperclip/.paperclip/instances/default/projects/9ff6f561-3790-444f-87c8-89cb0911775b/53acb115-e136-414d-af1b-0c2bfb6d966f/_default";

const FAILOVER_AGENT_NAMES = new Set([
  "CEO Strategy Agent",
  "Principal Advisor Escalation Agent",
  "Board / Investment Committee Memo Agent",
  "Final Proposal & Mandate Structuring Agent",
  "Proposal Red Team Agent",
]);

const FAILOVER_MODEL = "opencode/big-pickle";
const FAILOVER_VARIANT = "medium";

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}`);
    error.body = body;
    throw error;
  }
  return body;
}

function buildFailoverPayload(agent) {
  const existingMetadata = agent.metadata || {};
  const existingGovernance = existingMetadata.governance || {};
  const existingConfig = agent.adapterConfig || {};
  const primaryAdapter = existingMetadata.primaryAdapter || agent.adapterType || "unknown";
  const primaryProviderModel =
    existingMetadata.primaryProviderModel ||
    existingGovernance.providerModel ||
    existingConfig.model ||
    "unknown";

  return {
    adapterType: "opencode_local",
    adapterConfig: {
      ...existingConfig,
      cwd: PAPERCLIP_EXECUTION_CWD,
      model: FAILOVER_MODEL,
      variant: FAILOVER_VARIANT,
      dangerouslySkipPermissions: true,
    },
    metadata: {
      ...existingMetadata,
      primaryAdapter,
      primaryProviderModel,
      failoverMode: "quota_resilience",
      failoverActivatedAt: new Date().toISOString(),
      failoverReason: "Premium provider quota exhaustion",
      governance: {
        ...existingGovernance,
        adapter: "opencode_local",
        providerModel: FAILOVER_MODEL,
      },
    },
  };
}

async function wakeAgent(agentId) {
  return requestJson(`${BASE_URL}/api/agents/${agentId}/heartbeat/invoke`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const agents = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/agents`);
  const targets = agents.filter((agent) => FAILOVER_AGENT_NAMES.has(agent.name));
  const results = [];

  for (const agent of targets) {
    const needsPatch = agent.adapterType !== "opencode_local";
    if (needsPatch) {
      await requestJson(`${BASE_URL}/api/agents/${agent.id}`, {
        method: "PATCH",
        body: JSON.stringify(buildFailoverPayload(agent)),
      });
    }

    const wake = await wakeAgent(agent.id);
    results.push({
      id: agent.id,
      name: agent.name,
      patched: needsPatch,
      wakeStatus: wake.status || "queued",
      wakeRunId: wake.id || null,
    });
  }

  await sleep(4000);

  const refreshed = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/agents`);
  const statusByName = Object.fromEntries(refreshed.map((agent) => [agent.name, agent.status]));

  console.log(
    JSON.stringify(
      {
        ok: true,
        failoverModel: FAILOVER_MODEL,
        results: results.map((item) => ({
          ...item,
          statusAfter: statusByName[item.name] || "unknown",
        })),
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
