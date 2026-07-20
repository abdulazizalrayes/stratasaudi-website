#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { getPaperclipBaseUrl } = require("./lib/paperclip-base-url");
const { buildAdapterSignature } = require("./lib/paperclip-agent-adapter");
const { getInstructionsConfig } = require("./lib/paperclip-agent-prompts");
const { requestViaChromeSession } = require("./lib/paperclip-chrome-session");

const BASE_URL = getPaperclipBaseUrl();
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "9ff6f561-3790-444f-87c8-89cb0911775b";
const WORKSPACE_CWD =
  process.env.STRATA_WORKSPACE_CWD ||
  path.join(__dirname, "..");
const PAPERCLIP_EXECUTION_CWD =
  process.env.PAPERCLIP_EXECUTION_CWD ||
  process.env.STRATA_PAPERCLIP_EXECUTION_CWD ||
  "/home/paperclip/.paperclip/instances/default/projects/9ff6f561-3790-444f-87c8-89cb0911775b/53acb115-e136-414d-af1b-0c2bfb6d966f/_default";
const REGISTRY_PATH = path.join(WORKSPACE_CWD, "paperclip", "agents", "registry.json");
const SKILLS_PATH = path.join(WORKSPACE_CWD, "paperclip", "skills", "registry.json");
const PROMPTS_DIR = path.join(WORKSPACE_CWD, "paperclip", "agents", "prompts");
const COMPANY_SKILLS_DIR = path.join(WORKSPACE_CWD, "paperclip", "company-skills");
const CANONICAL_WEBSITE_DOMAIN = "https://www.stratasaudi.com";
const DISALLOWED_WEBSITE_URLS = [
  "https://stratasaudi-website-qgjqqrtfy-abdulazizalrayes-3914s-projects.vercel.app",
];
const OPENCODE_MAIN_MODEL = "opencode/big-pickle";
const OPENCODE_HELPER_MODEL = "opencode/deepseek-v4-flash-free";
const URL_MATCH = process.env.PAPERCLIP_CHROME_URL_MATCH || "ai.eijarat.com";
const IMPORT_LOCAL_SKILLS = process.env.PAPERCLIP_IMPORT_LOCAL_SKILLS === "true";
const ENABLE_PREMIUM_ADAPTERS = process.env.PAPERCLIP_ENABLE_PREMIUM_ADAPTERS === "true";
let useChromeSession = process.env.PAPERCLIP_USE_CHROME_SESSION === "true";
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeReasoningDepth(value) {
  if (value === "very_high") return "high";
  if (value === "medium") return "medium";
  return "low";
}

function normalizeCodingIntensity(value) {
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "low";
}

function normalizeMultilingualRequirement(value) {
  if (typeof value === "boolean") return value;
  return value === "medium" || value === "high" || value === "yes";
}

function normalizeDataSensitivity(value) {
  if (value === "high") return "restricted";
  if (value === "medium") return "internal";
  if (value === "restricted" || value === "internal" || value === "standard") return value;
  return "standard";
}

function roleFromAgent(agent) {
  const id = agent.id;
  if (id === "ceo_strategy_agent") return "ceo";
  if (id.includes("build") || id.includes("architecture")) return "engineer";
  if (id.includes("analytics_qa")) return "qa";
  if (id.includes("analytics") || id.includes("revops") || id.includes("revenue_operations")) return "pm";
  if (id.includes("seo") || id.includes("content") || id.includes("linkedin") || id.includes("paid_acquisition") || id.includes("account_based_marketing") || id.includes("pr_media")) return "cmo";
  if (id.includes("research") || id.includes("intelligence") || id.includes("chronology") || id.includes("evidence") || id.includes("document") || id.includes("fidic")) return "researcher";
  return "general";
}

function capabilityText(agent) {
  const parts = [];
  if (agent.objective) parts.push(agent.objective);
  if (Array.isArray(agent.responsibilities) && agent.responsibilities.length) {
    parts.push(`Responsibilities: ${agent.responsibilities.join(", ")}.`);
  }
  return parts.join(" ");
}

function toExecutionInstructionsConfig(instructionsConfig) {
  if (!instructionsConfig.instructionsEntryFile) return instructionsConfig;
  const instructionsRootPath = path.join(PAPERCLIP_EXECUTION_CWD, "paperclip", "agents", "prompts");
  return {
    ...instructionsConfig,
    instructionsRootPath,
    instructionsFilePath: path.join(instructionsRootPath, instructionsConfig.instructionsEntryFile),
  };
}

function mapAdapter(agent) {
  const instructionsConfig = toExecutionInstructionsConfig(getInstructionsConfig(PROMPTS_DIR, agent.id));

  if (agent.adapter === "codex" && ENABLE_PREMIUM_ADAPTERS) {
    return {
      adapterType: "codex_local",
      providerModel: "gpt-5.4",
      config: {
        cwd: PAPERCLIP_EXECUTION_CWD,
        ...instructionsConfig,
        model: "gpt-5.4",
        modelReasoningEffort: "high",
        dangerouslyBypassApprovalsAndSandbox: true,
      },
    };
  }

  if (agent.adapter === "claude_code" && ENABLE_PREMIUM_ADAPTERS) {
    return {
      adapterType: "claude_local",
      providerModel: "claude-sonnet-4-6",
      config: {
        cwd: PAPERCLIP_EXECUTION_CWD,
        ...instructionsConfig,
        model: "claude-sonnet-4-6",
        effort: "high",
        dangerouslySkipPermissions: true,
      },
    };
  }

  const model = agent.lane === "cheap" ? OPENCODE_HELPER_MODEL : OPENCODE_MAIN_MODEL;
  const variant = agent.reasoningDepth === "very_high" ? "high" : "medium";
  const primaryAdapter =
    agent.adapter === "codex"
      ? "codex_local"
      : agent.adapter === "claude_code"
        ? "claude_local"
        : null;
  const primaryProviderModel =
    agent.adapter === "codex"
      ? "gpt-5.4"
      : agent.adapter === "claude_code"
        ? "claude-sonnet-4-6"
        : null;

  return {
    adapterType: "opencode_local",
    providerModel: model,
    primaryAdapter,
    primaryProviderModel,
    config: {
      cwd: PAPERCLIP_EXECUTION_CWD,
      ...instructionsConfig,
      command: "opencode",
      model,
      variant,
      dangerouslySkipPermissions: true,
    },
  };
}

function iconForAgent(agent) {
  const id = agent.id;
  if (id.includes("ceo") || id.includes("board") || id.includes("final_proposal")) return "crown";
  if (id.includes("architecture") || id.includes("build")) return "code";
  if (id.includes("sales") || id.includes("outreach") || id.includes("lead_qualification")) return "target";
  if (id.includes("revenue") || id.includes("crm")) return "radar";
  if (id.includes("law_firm") || id.includes("proposal")) return "gem";
  if (id.includes("market_intelligence") || id.includes("research") || id.includes("search_intent")) return "search";
  if (id.includes("browser") || id.includes("analytics_qa")) return "globe";
  if (id.includes("analytics")) return "radar";
  if (id.includes("seo") || id.includes("discoverability")) return "telescope";
  if (id.includes("content") || id.includes("linkedin") || id.includes("pr_media")) return "sparkles";
  if (id.includes("contract") || id.includes("evidence") || id.includes("chronology")) return "shield";
  if (id.includes("supply_chain") || id.includes("vendor")) return "microscope";
  return "bot";
}

function governanceForAgent(agent, adapter) {
  return {
    businessOwner: agent.businessOwner,
    businessObjective: agent.objective,
    jobToBeDone: agent.jobToBeDone,
    riskLevel: agent.riskLevel,
    workloadVolume: agent.workloadVolume,
    reasoningDepth: normalizeReasoningDepth(agent.reasoningDepth),
    codingIntensity: normalizeCodingIntensity(agent.codingIntensity),
    multilingualRequirement: normalizeMultilingualRequirement(agent.multilingualRequirement),
    dataSensitivity: normalizeDataSensitivity(agent.dataSensitivity),
    lane: agent.lane,
    adapter: adapter.adapterType,
    providerModel: adapter.providerModel,
    fallback: agent.fallback,
    escalationPath: agent.escalationPath,
    requiredTools: agent.allowedTools,
    websiteDomainControl: {
      canonicalDomain: CANONICAL_WEBSITE_DOMAIN,
      disallowedPreviewUrls: DISALLOWED_WEBSITE_URLS,
      rule:
        "Use the canonical public domain for Strata website references; preview deployments are internal validation targets only.",
    },
    approvalRequired: agent.lane === "premium" || agent.id === "ceo_strategy_agent",
    premiumJustification: agent.premiumJustification || null,
  };
}

function parseResponseText(text, label) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    const err = new Error(`Expected JSON from ${label}`);
    err.rawPreview = String(text || "").slice(0, 240);
    throw err;
  }
}

function isCloudflareAccessHtml(text, contentType) {
  return (
    String(contentType || "").includes("text/html") ||
    String(text || "").includes("Sign in ・ Cloudflare Access")
  );
}

async function requestJsonViaFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (isCloudflareAccessHtml(text, contentType)) {
    const err = new Error("Cloudflare Access browser session required");
    err.requiresChromeSession = true;
    throw err;
  }
  const parsed = parseResponseText(text, url);

  if (!response.ok) {
    const err = new Error(`Request failed: ${response.status} ${response.statusText} for ${url}`);
    err.status = response.status;
    err.body = parsed;
    throw err;
  }

  return parsed;
}

function requestJsonViaChrome(url, options = {}) {
  const response = requestViaChromeSession({
    method: options.method || "GET",
    url,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body === undefined ? null : options.body,
    urlMatch: URL_MATCH,
  });
  const parsed = parseResponseText(response.text, url);
  if (response.status < 200 || response.status >= 300) {
    const err = new Error(`Chrome session request failed: ${response.status} ${response.statusText} for ${url}`);
    err.status = response.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

async function requestJson(url, options = {}) {
  if (useChromeSession) {
    return requestJsonViaChrome(url, options);
  }

  try {
    return await requestJsonViaFetch(url, options);
  } catch (error) {
    if (!error.requiresChromeSession) {
      throw error;
    }
    useChromeSession = true;
    return requestJsonViaChrome(url, options);
  }
}

async function importSkills(skillsRegistry) {
  const existingSkills = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/skills`);
  const existingByLocalName = new Map(
    existingSkills
      .filter((skill) => typeof skill.sourceLocator === "string" && skill.sourceLocator.startsWith(COMPANY_SKILLS_DIR))
      .map((skill) => [path.basename(skill.sourceLocator), skill])
  );
  const imported = [];
  const skipped = [];
  const missingNotImported = [];

  for (const skill of skillsRegistry.skills) {
    if (existingByLocalName.has(skill.id)) {
      skipped.push(skill.id);
      continue;
    }

    if (!IMPORT_LOCAL_SKILLS) {
      missingNotImported.push(skill.id);
      continue;
    }

    const source = path.join(COMPANY_SKILLS_DIR, skill.id);
    const result = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/skills/import`, {
      method: "POST",
      body: JSON.stringify({ source }),
    });
    imported.push({
      slug: skill.id,
      id: result.id || result.skill?.id || null,
    });
  }

  const refreshedSkills = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/skills`);
  const skillRefs = new Map();
  for (const skill of refreshedSkills) {
    const ref = skill.key || skill.slug;
    if (skill.slug) skillRefs.set(skill.slug, ref);
    if (skill.name) skillRefs.set(skill.name, ref);
    if (skill.sourceLocator) skillRefs.set(path.basename(skill.sourceLocator), ref);
  }

  return {
    imported,
    skipped,
    missingNotImported,
    skillRefs,
  };
}

function buildPayload(agent, skillRefs, reportsTo) {
  const adapter = mapAdapter(agent);
  const desiredSkills = (agent.requiredSkills || []).map((skillId) => skillRefs.get(skillId) || skillId);
  const payload = {
    name: agent.name,
    title: agent.name,
    role: roleFromAgent(agent),
    icon: iconForAgent(agent),
    capabilities: capabilityText(agent),
    desiredSkills,
    adapterType: adapter.adapterType,
    adapterConfig: adapter.config,
    metadata: {
      registryId: agent.id,
      adapterSignature: buildAdapterSignature(adapter.adapterType, adapter.config),
      ...(adapter.primaryAdapter
        ? {
            primaryAdapter: adapter.primaryAdapter,
            primaryProviderModel: adapter.primaryProviderModel,
            failoverMode: "cloud_runtime_recovery",
            failoverReason: "Premium adapter environment unavailable in cloud runtime",
          }
        : {}),
      governance: governanceForAgent(agent, adapter),
    },
    runtimeConfig: {
      heartbeat: {
        enabled: true,
        intervalSec: 300,
        wakeOnDemand: true,
      },
    },
  };

  if (reportsTo) payload.reportsTo = reportsTo;

  return payload;
}

async function createAgent(url, payload) {
  return requestJson(url, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function patchAgent(url, payload) {
  return requestJson(url, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

function stableJson(value) {
  return JSON.stringify(value || {});
}

function buildPatchPayload(existing, desiredPayload) {
  const patch = {};
  let adapterRelevantChange = false;
  const existingSignature = existing?.metadata?.adapterSignature || null;
  const desiredSignature = desiredPayload?.metadata?.adapterSignature || null;
  const adapterSignatureChanged = existingSignature !== desiredSignature;

  if (existing.role !== desiredPayload.role) patch.role = desiredPayload.role;
  if (existing.icon !== desiredPayload.icon) patch.icon = desiredPayload.icon;
  if (existing.capabilities !== desiredPayload.capabilities) {
    patch.capabilities = desiredPayload.capabilities;
  }
  if ((existing.reportsTo || null) !== (desiredPayload.reportsTo || null)) {
    patch.reportsTo = desiredPayload.reportsTo || null;
  }
  if (existing.adapterType !== desiredPayload.adapterType) {
    patch.adapterType = desiredPayload.adapterType;
    adapterRelevantChange = true;
  }
  if (adapterSignatureChanged) {
    patch.adapterConfig = desiredPayload.adapterConfig;
    adapterRelevantChange = true;
  }
  if (stableJson(existing.metadata) !== stableJson(desiredPayload.metadata)) {
    patch.metadata = desiredPayload.metadata;
    adapterRelevantChange = true;
  }
  if (stableJson(existing.runtimeConfig) !== stableJson(desiredPayload.runtimeConfig)) {
    patch.runtimeConfig = desiredPayload.runtimeConfig;
  }
  if (adapterRelevantChange && !patch.adapterType) {
    patch.adapterType = desiredPayload.adapterType;
  }

  return patch;
}

async function syncAgents(agentRegistry, skillRefs) {
  const existingAgents = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/agents`);
  const existingByRegistryId = new Map(
    existingAgents
      .filter((agent) => agent.metadata && agent.metadata.registryId)
      .map((agent) => [agent.metadata.registryId, agent])
  );
  const existingByName = new Map(existingAgents.map((agent) => [agent.name, agent]));

  let ceoId =
    existingByRegistryId.get("ceo_strategy_agent")?.id ||
    existingByName.get("CEO Strategy Agent")?.id ||
    null;

  const results = [];
  for (const agent of agentRegistry.agents) {
    const existing =
      existingByRegistryId.get(agent.id) ||
      existingByName.get(agent.name);

    const reportsTo =
      agent.id === "ceo_strategy_agent"
        ? null
        : ceoId;
    const payload = buildPayload(agent, skillRefs, reportsTo);

    if (existing) {
      const patch = buildPatchPayload(existing, payload);
      const patchKeys = Object.keys(patch);
      if (patchKeys.length) {
        const updated = await patchAgent(`${BASE_URL}/api/agents/${existing.id}`, patch);
        results.push({
          registryId: agent.id,
          name: agent.name,
          status: "updated",
          id: existing.id,
          patchKeys,
          response: updated,
        });
      } else {
        results.push({
          registryId: agent.id,
          name: agent.name,
          status: "exists",
          id: existing.id,
        });
      }
      if (agent.id === "ceo_strategy_agent") ceoId = existing.id;
      continue;
    }

    let created = null;
    let lastError = null;
    try {
      created = await createAgent(
        `${BASE_URL}/api/companies/${COMPANY_ID}/agents`,
        payload
      );
      results.push({
        registryId: agent.id,
        name: agent.name,
        status: "created",
        response: created,
      });
    } catch (error) {
      lastError = {
        endpoint: "agents",
        status: error.status || null,
        body: error.body || null,
      };
    }

    if (!created) {
      results.push({
        registryId: agent.id,
        name: agent.name,
        status: "failed",
        error: lastError,
      });
      continue;
    }

    const createdId =
      created.id ||
      created.agent?.id ||
      created.hire?.agentId ||
      created.hire?.pendingAgentId ||
      null;
    if (agent.id === "ceo_strategy_agent" && createdId) ceoId = createdId;
  }

  return results;
}

async function main() {
  const skillsRegistry = readJson(SKILLS_PATH);
  const agentRegistry = readJson(REGISTRY_PATH);

  const skillResult = await importSkills(skillsRegistry);
  const agentResults = await syncAgents(agentRegistry, skillResult.skillRefs);

  const summary = {
    baseUrl: BASE_URL,
    companyId: COMPANY_ID,
    workspaceCwd: WORKSPACE_CWD,
    importedSkills: skillResult.imported.length,
    skippedSkills: skillResult.skipped.length,
    missingSkillsNotImported: skillResult.missingNotImported.length,
    localSkillImportEnabled: IMPORT_LOCAL_SKILLS,
    createdAgents: agentResults.filter((item) => item.status === "created").length,
    updatedAgents: agentResults.filter((item) => item.status === "updated").length,
    existingAgents: agentResults.filter((item) => item.status === "exists").length,
    failedAgents: agentResults.filter((item) => item.status === "failed").length,
    failed: agentResults.filter((item) => item.status === "failed"),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error.message,
        status: error.status || null,
        body: error.body || null,
      },
      null,
      2
    )
  );
  process.exit(1);
});
