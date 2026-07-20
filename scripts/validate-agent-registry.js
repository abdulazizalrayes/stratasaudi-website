const fs = require("fs");
const path = require("path");

const ROOT = process.env.STRATA_WORKSPACE_CWD || path.join(__dirname, "..");
const AGENTS_DIR = path.join(ROOT, "paperclip", "agents");
const PROMPTS_DIR = path.join(AGENTS_DIR, "prompts");
const registryPath = path.join(AGENTS_DIR, "registry.json");
const promptOverridesPath = path.join(AGENTS_DIR, "prompt-overrides.json");

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const promptOverrides = fs.existsSync(promptOverridesPath)
  ? JSON.parse(fs.readFileSync(promptOverridesPath, "utf8"))
  : {};

const required = [
  "id",
  "name",
  "businessOwner",
  "objective",
  "jobToBeDone",
  "riskLevel",
  "workloadVolume",
  "reasoningDepth",
  "codingIntensity",
  "multilingualRequirement",
  "dataSensitivity",
  "lane",
  "adapter",
  "providerModel",
  "fallback",
  "escalationPath",
  "responsibilities",
  "requiredSkills",
  "allowedTools",
  "browserPermission",
  "kpiOwnership",
  "approvalRequirement"
];

const validLanes = new Set(["premium", "core", "cheap"]);
const premiumAdapters = new Set(["codex", "claude_code"]);

const failures = [];
const registryIds = new Set();
const registryNames = new Set();

registry.agents.forEach((agent) => {
  if (registryIds.has(agent.id)) {
    failures.push(`${agent.name}: duplicate registry id ${agent.id}`);
  }
  registryIds.add(agent.id);

  if (registryNames.has(agent.name)) {
    failures.push(`${agent.name}: duplicate agent name`);
  }
  registryNames.add(agent.name);
});

registry.agents.forEach((agent) => {
  required.forEach((field) => {
    if (agent[field] === undefined || agent[field] === null || agent[field] === "") {
      failures.push(`${agent.name}: missing ${field}`);
    }
  });

  if (!validLanes.has(agent.lane)) {
    failures.push(`${agent.name}: invalid lane ${agent.lane}`);
  }

  if (premiumAdapters.has(agent.adapter) && !agent.premiumJustification) {
    failures.push(`${agent.name}: premium adapter selected without justification`);
  }

  if (Array.isArray(agent.responsibilities) && agent.responsibilities.length === 0) {
    failures.push(`${agent.name}: responsibilities empty`);
  }

  if (Array.isArray(agent.requiredSkills) && agent.requiredSkills.length === 0) {
    failures.push(`${agent.name}: requiredSkills empty`);
  }

  if (Array.isArray(agent.allowedTools) && agent.allowedTools.length === 0) {
    failures.push(`${agent.name}: allowedTools empty`);
  }
});

Object.entries(promptOverrides).forEach(([agentId, override]) => {
  if (!registryIds.has(agentId)) {
    failures.push(`prompt-overrides.json: unknown agent id ${agentId}`);
  }

  if (!override || !Array.isArray(override.additionalInstruction) || override.additionalInstruction.length === 0) {
    failures.push(`prompt-overrides.json: ${agentId} missing non-empty additionalInstruction array`);
  }
});

if (fs.existsSync(PROMPTS_DIR)) {
  const promptFiles = fs.readdirSync(PROMPTS_DIR).filter((file) => file.endsWith("_agent.md"));

  promptFiles.forEach((file) => {
    const agentId = path.basename(file, ".md");
    const filePath = path.join(PROMPTS_DIR, file);
    const body = fs.readFileSync(filePath, "utf8").trim();

    if (!registryIds.has(agentId)) {
      failures.push(`prompts/${file}: no matching registry agent id`);
    }

    if (!body.startsWith("# ")) {
      failures.push(`prompts/${file}: expected markdown title heading`);
    }
  });
}

if (failures.length > 0) {
  console.error("Agent registry validation failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validated ${registry.agents.length} agents successfully.`);
