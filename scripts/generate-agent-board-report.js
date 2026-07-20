#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { getPaperclipBaseUrl } = require("./lib/paperclip-base-url");

const BASE_URL = getPaperclipBaseUrl();
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "9ff6f561-3790-444f-87c8-89cb0911775b";
const ROOT =
  process.env.STRATA_WORKSPACE_CWD ||
  path.join(__dirname, "..");

const registryPath = path.join(ROOT, "paperclip", "agents", "registry.json");
const automationPath = path.join(ROOT, "paperclip", "agents", "automation-manifest.json");
const outPath = path.join(ROOT, "ops", "AGENT_BOARD_SCORECARD_2026-04-12.md");
const enhancementPath = path.join(ROOT, "ops", "AGENT_ENHANCEMENT_PLAN_2026-04-12.md");

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body)}`);
  }
  return body;
}

function normalizeProviderModel(agent) {
  const live = agent.adapterType || "unknown";
  const config = agent.adapterConfig || {};
  if (live === "claude_local") return config.model || "claude-sonnet-4-6";
  if (live === "codex_local") return config.model || "gpt-5.4";
  return config.model || "opencode/deepseek-v4-flash-free";
}

function cadenceForAgent(registryId, automations) {
  const owned = [];
  const supporting = [];
  for (const automation of automations) {
    if (automation.ownerAgent === registryId) owned.push(automation.cadence);
    if ((automation.supportAgents || []).includes(registryId)) supporting.push(automation.cadence);
  }
  return {
    owned,
    supporting,
    usageNow:
      owned.length || supporting.length
        ? `${owned.length ? `owner: ${owned.join("; ")}` : ""}${owned.length && supporting.length ? " | " : ""}${supporting.length ? `support: ${supporting.join("; ")}` : ""}`
        : "On-demand only",
  };
}

function productivityBand(agent, cadence, issueCounter) {
  const open = issueCounter.todo + issueCounter.in_progress + issueCounter.backlog + issueCounter.blocked;
  const cadenceCount = cadence.owned.length + cadence.supporting.length;
  if (issueCounter.blocked > 0) return "Medium (externally blocked)";
  if (cadenceCount >= 2) return "High";
  if (cadenceCount === 1 || open > 0) return "Medium";
  return "Low";
}

function skillSummary(skills) {
  const filtered = skills.filter((skill) => !String(skill).startsWith("paperclip"));
  const effective = filtered.length ? filtered : skills;
  if (!effective.length) return "No";
  const trimmed = effective
    .map((skill) => String(skill).split("/").slice(-1)[0])
    .slice(0, 3)
    .join(", ");
  return `Yes (${effective.length}) - ${trimmed}`;
}

function enhancementNote(registryAgent, liveAgent, cadence, issueCounter) {
  const notes = [];
  if (registryAgent.adapter === "claude_code" && liveAgent.adapterType !== "claude_local") {
    notes.push("restore true Claude premium adapter");
  }
  if (registryAgent.adapter === "codex" && liveAgent.adapterType !== "codex_local") {
    notes.push("restore true Codex premium adapter");
  }
  if (!(cadence.owned.length + cadence.supporting.length)) {
    notes.push("consider cadence if business-critical");
  }
  if (issueCounter.blocked > 0) {
    notes.push("blocked by external dependency");
  }
  if ((registryAgent.requiredSkills || []).length < 3) {
    notes.push("deepen skills");
  }
  if (!notes.length) notes.push("keep current");
  return notes.join("; ");
}

function tableForAgents(title, rows) {
  const lines = [];
  lines.push(`## ${title}`);
  lines.push("");
  lines.push("| Agent | Lane | Live model | Planned model | Usage now | Productivity | Skills | Enhancement |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows) {
    lines.push(
      `| ${row.name} | ${row.lane} | ${row.liveModel} | ${row.plannedModel} | ${row.usageNow} | ${row.productivity} | ${row.skills} | ${row.enhancement} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function groupedRows(rows) {
  return {
    Premium: rows.filter((row) => row.lane === "premium"),
    Core: rows.filter((row) => row.lane === "core"),
    Cheap: rows.filter((row) => row.lane === "cheap"),
  };
}

function buildEnhancementPlan(rows) {
  const priorities = [
    {
      title: "Priority 1 - Adapter and governance integrity",
      items: rows
        .filter((row) => row.enhancement.includes("restore true"))
        .map((row) => `- ${row.name}: ${row.enhancement}`),
    },
    {
      title: "Priority 2 - Revenue velocity",
      items: rows
        .filter((row) => /Revenue|Sales|Law Firm|EPC|Named Account|Outreach|Follow-Up|Mailbox/i.test(row.name))
        .filter((row) => row.enhancement !== "keep current")
        .map((row) => `- ${row.name}: ${row.enhancement}`),
    },
    {
      title: "Priority 3 - Search, analytics, and authority",
      items: rows
        .filter((row) => /SEO|Analytics|Search|Content|LinkedIn|CRO/i.test(row.name))
        .filter((row) => row.enhancement !== "keep current")
        .map((row) => `- ${row.name}: ${row.enhancement}`),
    },
    {
      title: "Priority 4 - Utility cost discipline",
      items: [
        "- Push summarization, formatting, first-pass normalization, and CRM hygiene into cheap-lane agents first.",
        "- Keep browser usage only where browser truth materially improves the outcome.",
        "- Keep premium agents asleep until final review, final wording, or architecture-sensitive implementation.",
      ],
    },
  ];

  const lines = [];
  lines.push("# Agent Enhancement Plan");
  lines.push("");
  lines.push("Date: 2026-04-12");
  lines.push("Project: Strata Saudi / stratasaudi.com");
  lines.push("");
  for (const group of priorities) {
    lines.push(`## ${group.title}`);
    lines.push("");
    for (const item of group.items) lines.push(item);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")).agents;
  const registryById = new Map(registry.map((agent) => [agent.id, agent]));
  const automations = JSON.parse(fs.readFileSync(automationPath, "utf8")).automations;
  const agents = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/agents`);
  const issues = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/issues`);
  const liveById = new Map(agents.map((agent) => [agent.id, agent]));
  const issueCounterByRegistryId = new Map();
  for (const issue of issues) {
    if (!issue.assigneeAgentId) continue;
    const liveAgent = liveById.get(issue.assigneeAgentId);
    const registryId = liveAgent?.metadata?.registryId;
    if (!registryId) continue;
    if (!issueCounterByRegistryId.has(registryId)) {
      issueCounterByRegistryId.set(registryId, {
        todo: 0,
        in_progress: 0,
        backlog: 0,
        blocked: 0,
      });
    }
    const counter = issueCounterByRegistryId.get(registryId);
    if (counter[issue.status] !== undefined) counter[issue.status] += 1;
  }

  const rows = agents
    .map((liveAgent) => {
      const registryId = liveAgent?.metadata?.registryId;
      const registryAgent = registryById.get(registryId) || null;
      const cadence = cadenceForAgent(registryId, automations);
      const issueCounter = issueCounterByRegistryId.get(registryId) || {
        todo: 0,
        in_progress: 0,
        backlog: 0,
        blocked: 0,
      };
      return {
        name: liveAgent.name,
        lane: registryAgent?.lane || liveAgent?.metadata?.governance?.lane || "unknown",
        liveModel: `${liveAgent.adapterType} / ${normalizeProviderModel(liveAgent)}`,
        plannedModel: registryAgent
          ? `${registryAgent.adapter} / ${registryAgent.providerModel}`
          : "unknown",
        usageNow: cadence.usageNow,
        productivity: productivityBand(liveAgent, cadence, issueCounter),
        skills: skillSummary(registryAgent?.requiredSkills || []),
        enhancement: enhancementNote(registryAgent || { requiredSkills: [] }, liveAgent, cadence, issueCounter),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const grouped = groupedRows(rows);

  const lines = [];
  lines.push("# Agent Board Scorecard");
  lines.push("");
  lines.push("Date: 2026-04-12");
  lines.push("Project: Strata Saudi / stratasaudi.com");
  lines.push("");
  lines.push("This report reflects live Paperclip state plus the intended registry governance model.");
  lines.push("");
  lines.push(tableForAgents("Premium", grouped.Premium));
  lines.push(tableForAgents("Core", grouped.Core));
  lines.push(tableForAgents("Cheap", grouped.Cheap));

  fs.writeFileSync(outPath, `${lines.join("\n")}\n`);
  fs.writeFileSync(enhancementPath, buildEnhancementPlan(rows));

  console.log(
    JSON.stringify(
      {
        ok: true,
        scorecard: outPath,
        enhancementPlan: enhancementPath,
        rows: rows.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
