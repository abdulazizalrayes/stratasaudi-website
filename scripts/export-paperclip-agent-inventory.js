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
const inventoryJsonPath = path.join(ROOT, "paperclip", "agents", "live-inventory.json");
const inventoryMdPath = path.join(ROOT, "ops", "PAPERCLIP_AGENT_INVENTORY.md");

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

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeDesiredSkills(raw) {
  if (!raw || !Array.isArray(raw.desiredSkills)) return [];
  return raw.desiredSkills;
}

function categoryForAgent(agent) {
  const registryId = agent.registryId || "";
  const name = agent.name || "";
  const combined = `${registryId} ${name}`.toLowerCase();

  if (
    combined.includes("contract_risk") ||
    combined.includes("project_risk") ||
    combined.includes("pre_litigation") ||
    combined.includes("independent_technical_opinion") ||
    combined.includes("supply_chain") ||
    combined.includes("fidic") ||
    combined.includes("chronology") ||
    combined.includes("technical_evidence") ||
    combined.includes("document_sufficiency") ||
    combined.includes("saudi_construction_risk") ||
    combined.includes("principal_advisor") ||
    combined.includes("board_investment_committee") ||
    combined.includes("final_proposal") ||
    combined.includes("proposal_red_team")
  ) {
    return "Advisory";
  }

  if (
    combined.includes("revenue") ||
    combined.includes("sales") ||
    combined.includes("business_development") ||
    combined.includes("law_firm_relationship") ||
    combined.includes("epc_account_intelligence") ||
    combined.includes("market_intelligence") ||
    combined.includes("proposal_pitch") ||
    combined.includes("meeting_briefing") ||
    combined.includes("lead_qualification") ||
    combined.includes("named_account") ||
    combined.includes("outreach_personalization") ||
    combined.includes("strategic_follow_up") ||
    combined.includes("conference_ecosystem") ||
    combined.includes("mailbox_operations") ||
    combined.includes("contact_enrichment")
  ) {
    return "Revenue";
  }

  if (
    combined.includes("content_strategy") ||
    combined.includes("thought_leadership") ||
    combined.includes("linkedin_authority") ||
    combined.includes("pr_media") ||
    combined.includes("account_based_marketing") ||
    combined.includes("social_setup")
  ) {
    return "Content/Authority";
  }

  if (
    combined.includes("seo_geo_aeo") ||
    combined.includes("search_console_operations") ||
    combined.includes("ai_discoverability") ||
    combined.includes("search_intent") ||
    combined.includes("paid_acquisition") ||
    combined.includes("website_cro")
  ) {
    return "Search/Discoverability";
  }

  if (combined.includes("analytics")) {
    return "Analytics";
  }

  if (
    combined.includes("build_architecture") ||
    combined.includes("browser_operations") ||
    combined.includes("research_scraping") ||
    combined.includes("data_cleanup") ||
    combined.includes("admin_formatting")
  ) {
    return "Build/Operations";
  }

  if (combined.includes("ceo_strategy")) {
    return "Executive";
  }

  return "Other";
}

function toMarkdown(snapshot) {
  const lines = [];
  lines.push("# Paperclip Agent Inventory");
  lines.push("");
  lines.push(`Generated: ${snapshot.generatedAt}`);
  lines.push(`Company: ${snapshot.companyId}`);
  lines.push(`Total agents: ${snapshot.summary.totalAgents}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Premium lane: ${snapshot.summary.byLane.premium || 0}`);
  lines.push(`- Core lane: ${snapshot.summary.byLane.core || 0}`);
  lines.push(`- Cheap lane: ${snapshot.summary.byLane.cheap || 0}`);
  lines.push(`- OpenCode agents: ${snapshot.summary.byAdapter.opencode_local || 0}`);
  lines.push(`- Codex agents: ${snapshot.summary.byAdapter.codex_local || 0}`);
  lines.push(`- Claude agents: ${snapshot.summary.byAdapter.claude_local || 0}`);
  lines.push("");
  lines.push("## Executive View");
  lines.push("");
  for (const [category, agents] of Object.entries(snapshot.byCategory)) {
    lines.push(`### ${category}`);
    lines.push("");
    for (const agent of agents) {
      const managerText = agent.reportsToName ? ` -> ${agent.reportsToName}` : "";
      lines.push(`- ${agent.name} (${agent.adapterType}, ${agent.lane})${managerText}`);
    }
    lines.push("");
  }
  lines.push("## Agent Roster");
  lines.push("");
  lines.push("| Name | Live ID | Reports To | Lane | Adapter | Role | Desired Skills |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const agent of snapshot.agents) {
    lines.push(
      `| ${agent.name} | ${agent.id} | ${agent.reportsToName || "None"} | ${agent.lane} | ${agent.adapterType} | ${agent.role} | ${agent.desiredSkills.join(", ") || "None"} |`
    );
  }
  lines.push("");
  lines.push("## Department View");
  lines.push("");
  for (const [manager, reports] of Object.entries(snapshot.byManager)) {
    lines.push(`### ${manager}`);
    lines.push("");
    for (const report of reports) {
      lines.push(`- ${report.name} (${report.adapterType}, ${report.lane})`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const registryByName = new Map(registry.agents.map((agent) => [agent.name, agent]));
  const liveAgents = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/agents`);

  const desiredSkillsById = new Map();
  for (const agent of liveAgents) {
    const skillState = await requestJson(`${BASE_URL}/api/agents/${agent.id}/skills`);
    desiredSkillsById.set(agent.id, normalizeDesiredSkills(skillState));
  }

  const liveById = new Map(liveAgents.map((agent) => [agent.id, agent]));
  const enrichedAgents = liveAgents
    .map((agent) => {
      const spec =
        (agent.metadata && agent.metadata.registryId &&
          registry.agents.find((item) => item.id === agent.metadata.registryId)) ||
        registryByName.get(agent.name) ||
        null;
      const governance = agent.metadata && agent.metadata.governance ? agent.metadata.governance : null;
      const reportsToName =
        agent.reportsTo && liveById.has(agent.reportsTo) ? liveById.get(agent.reportsTo).name : null;
      return {
        id: agent.id,
        name: agent.name,
        registryId: agent.metadata && agent.metadata.registryId ? agent.metadata.registryId : null,
        role: agent.role,
        adapterType: agent.adapterType,
        reportsTo: agent.reportsTo || null,
        reportsToName,
        lane: governance && governance.lane ? governance.lane : spec ? spec.lane : "unknown",
        desiredSkills: desiredSkillsById.get(agent.id) || [],
        businessOwner:
          governance && governance.businessOwner ? governance.businessOwner : spec ? spec.businessOwner : null,
        objective:
          governance && governance.businessObjective
            ? governance.businessObjective
            : spec
              ? spec.objective
              : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const summary = {
    totalAgents: enrichedAgents.length,
    byLane: enrichedAgents.reduce((acc, agent) => {
      acc[agent.lane] = (acc[agent.lane] || 0) + 1;
      return acc;
    }, {}),
    byAdapter: enrichedAgents.reduce((acc, agent) => {
      acc[agent.adapterType] = (acc[agent.adapterType] || 0) + 1;
      return acc;
    }, {}),
  };

  const byManager = {};
  for (const agent of enrichedAgents) {
    const manager = agent.reportsToName || "Top level";
    if (!byManager[manager]) byManager[manager] = [];
    byManager[manager].push({
      name: agent.name,
      adapterType: agent.adapterType,
      lane: agent.lane,
    });
  }

  const byCategory = {};
  for (const agent of enrichedAgents) {
    const category = categoryForAgent(agent);
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push({
      name: agent.name,
      adapterType: agent.adapterType,
      lane: agent.lane,
      reportsToName: agent.reportsToName,
    });
  }

  const orderedCategories = [
    "Executive",
    "Advisory",
    "Revenue",
    "Content/Authority",
    "Search/Discoverability",
    "Analytics",
    "Build/Operations",
    "Other",
  ];
  const sortedByCategory = {};
  for (const category of orderedCategories) {
    if (!byCategory[category]) continue;
    sortedByCategory[category] = byCategory[category].sort((a, b) => a.name.localeCompare(b.name));
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    companyId: COMPANY_ID,
    summary,
    agents: enrichedAgents,
    byCategory: sortedByCategory,
    byManager,
  };

  ensureDir(inventoryJsonPath);
  ensureDir(inventoryMdPath);
  fs.writeFileSync(inventoryJsonPath, JSON.stringify(snapshot, null, 2));
  fs.writeFileSync(inventoryMdPath, toMarkdown(snapshot));

  console.log(
    JSON.stringify(
      {
        json: inventoryJsonPath,
        markdown: inventoryMdPath,
        totalAgents: summary.totalAgents,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
