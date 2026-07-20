#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { getPaperclipBaseUrl } = require("./lib/paperclip-base-url");

const BASE_URL = getPaperclipBaseUrl();
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "9ff6f561-3790-444f-87c8-89cb0911775b";
const ROOT =
  process.env.STRATA_WORKSPACE_CWD ||
  "/Users/abdulazizalrayes/Documents/New project/stratasaudi-website";

const registry = JSON.parse(
  fs.readFileSync(path.join(ROOT, "paperclip", "agents", "registry.json"), "utf8")
);
const structure = JSON.parse(
  fs.readFileSync(path.join(ROOT, "paperclip", "agents", "org-structure.json"), "utf8")
);

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

async function main() {
  const agents = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/agents`);
  const byRegistryId = new Map();
  const byName = new Map(agents.map((a) => [a.name, a]));
  for (const agent of agents) {
    if (agent.metadata && agent.metadata.registryId) {
      byRegistryId.set(agent.metadata.registryId, agent);
    }
  }

  const updates = [];
  for (const spec of registry.agents) {
    const live = byRegistryId.get(spec.id) || byName.get(spec.name);
    if (!live) continue;
    const managerRegistryId = structure.reportsTo[spec.id];
    const manager = managerRegistryId ? byRegistryId.get(managerRegistryId) || byName.get(registry.agents.find((a) => a.id === managerRegistryId)?.name) : null;
    const desiredReportsTo = manager ? manager.id : null;
    if ((live.reportsTo || null) === (desiredReportsTo || null)) continue;
    updates.push({
      id: live.id,
      name: live.name,
      reportsTo: desiredReportsTo,
      manager: manager ? manager.name : null,
    });
  }

  for (const update of updates) {
    await requestJson(`${BASE_URL}/api/agents/${update.id}`, {
      method: "PATCH",
      body: JSON.stringify({ reportsTo: update.reportsTo }),
    });
  }

  console.log(JSON.stringify({ updated: updates.length, updates }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
