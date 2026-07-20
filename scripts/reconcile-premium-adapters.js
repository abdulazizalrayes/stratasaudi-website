#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { buildAdapterSignature } = require("./lib/paperclip-agent-adapter");
const { getPaperclipBaseUrl } = require("./lib/paperclip-base-url");
const { getInstructionsConfig } = require("./lib/paperclip-agent-prompts");

const BASE_URL = getPaperclipBaseUrl();
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "9ff6f561-3790-444f-87c8-89cb0911775b";
const ROOT =
  process.env.STRATA_WORKSPACE_CWD ||
  path.join(__dirname, "..");
const DRY_RUN =
  process.argv.includes("--dry-run") ||
  process.env.PAPERCLIP_DRY_RUN === "true";

const registryPath = path.join(ROOT, "paperclip", "agents", "registry.json");
const promptsDir = path.join(ROOT, "paperclip", "agents", "prompts");

function stableJson(value) {
  return JSON.stringify(value || {});
}

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

function mapAdapter(agent) {
  const instructionsConfig = getInstructionsConfig(promptsDir, agent.id);

  if (agent.adapter === "codex") {
    return {
      adapterType: "codex_local",
      adapterConfig: {
        cwd: ROOT,
        ...instructionsConfig,
        model: "gpt-5.4",
        modelReasoningEffort: "high",
        dangerouslyBypassApprovalsAndSandbox: true,
      },
      governanceAdapter: "codex_local",
      governanceModel: "gpt-5.4",
    };
  }

  if (agent.adapter === "claude_code") {
    return {
      adapterType: "claude_local",
      adapterConfig: {
        cwd: ROOT,
        ...instructionsConfig,
        model: "claude-sonnet-4-6",
        effort: "high",
        dangerouslySkipPermissions: true,
      },
      governanceAdapter: "claude_local",
      governanceModel: "claude-sonnet-4-6",
    };
  }

  return null;
}

async function main() {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")).agents;
  const registryById = new Map(registry.map((agent) => [agent.id, agent]));
  const liveAgents = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/agents`);
  const results = [];

  for (const liveAgent of liveAgents) {
    const registryId = liveAgent?.metadata?.registryId;
    const registryAgent = registryById.get(registryId);
    if (!registryAgent || registryAgent.lane !== "premium") continue;

    const desired = mapAdapter(registryAgent);
    if (!desired) continue;

    const desiredMetadata = {
      ...(liveAgent.metadata || {}),
      adapterSignature: buildAdapterSignature(desired.adapterType, desired.adapterConfig),
      governance: {
        ...((liveAgent.metadata && liveAgent.metadata.governance) || {}),
        adapter: desired.governanceAdapter,
        providerModel: desired.governanceModel,
      },
    };
    delete desiredMetadata.failoverMode;
    delete desiredMetadata.failoverReason;
    delete desiredMetadata.failoverActivatedAt;

    const currentModel = liveAgent?.adapterConfig?.model || null;
    const currentAdapter = liveAgent.adapterType;
    const metadataMatches = stableJson(liveAgent.metadata) === stableJson(desiredMetadata);
    if (currentAdapter === desired.adapterType && metadataMatches) {
      results.push({
        name: liveAgent.name,
        status: "already_correct",
        adapterType: currentAdapter,
        model: currentModel,
      });
      continue;
    }

    if (DRY_RUN) {
      results.push({
        name: liveAgent.name,
        status: "would_patch",
        adapterType: desired.adapterType,
        model: desired.adapterConfig.model,
      });
      continue;
    }

    await requestJson(`${BASE_URL}/api/agents/${liveAgent.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        adapterType: desired.adapterType,
        adapterConfig: desired.adapterConfig,
        metadata: desiredMetadata,
      }),
    });

    results.push({
      name: liveAgent.name,
      status: "patched",
      adapterType: desired.adapterType,
      model: desired.adapterConfig.model,
    });
  }

  console.log(JSON.stringify({ ok: true, dryRun: DRY_RUN, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, body: error.body || null }, null, 2));
  process.exit(1);
});
