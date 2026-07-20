#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { getPaperclipBaseUrl } = require("./lib/paperclip-base-url");

const BASE_URL = getPaperclipBaseUrl();
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "9ff6f561-3790-444f-87c8-89cb0911775b";
const PROJECT_ID =
  process.env.PAPERCLIP_PROJECT_ID || "53acb115-e136-414d-af1b-0c2bfb6d966f";
const ROOT =
  process.env.STRATA_WORKSPACE_CWD ||
  path.join(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "paperclip", "agents", "automation-manifest.json");

const cronByCadence = new Map([
  ["Daily at 08:45 Asia/Riyadh", "45 8 * * *"],
  ["Daily at 09:00 Asia/Riyadh", "0 9 * * *"],
  ["Daily at 09:30 Asia/Riyadh", "30 9 * * *"],
  ["Daily at 10:00 Asia/Riyadh", "0 10 * * *"],
  ["Daily at 10:15 Asia/Riyadh", "15 10 * * *"],
  ["Weekly on Sunday at 11:00 Asia/Riyadh", "0 11 * * 0"],
  ["Weekly on Monday at 11:00 Asia/Riyadh", "0 11 * * 1"],
  ["Weekly on Tuesday at 11:00 Asia/Riyadh", "0 11 * * 2"],
  ["Weekly on Thursday at 16:00 Asia/Riyadh", "0 16 * * 4"],
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function buildDescription(item) {
  const lines = [
    `Purpose: ${item.purpose}`,
    `Output: ${item.output}`,
    `Escalation path: ${item.escalationPath}`,
  ];
  if (Array.isArray(item.supportAgents) && item.supportAgents.length) {
    lines.push(`Support agents: ${item.supportAgents.join(", ")}`);
  }
  lines.push("Open an inbox item on every run.");
  return lines.join("\n");
}

async function main() {
  const manifest = readJson(MANIFEST_PATH);
  const agents = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/agents`);
  const existingRoutines = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/routines`);

  const agentIdByRegistryId = new Map();
  for (const agent of agents) {
    if (agent.metadata && agent.metadata.registryId) {
      agentIdByRegistryId.set(agent.metadata.registryId, agent.id);
    }
  }

  const existingByTitle = new Map(existingRoutines.map((routine) => [routine.title, routine]));
  const results = [];

  for (const item of manifest.automations) {
    const assigneeAgentId = agentIdByRegistryId.get(item.ownerAgent);
    if (!assigneeAgentId) {
      results.push({ title: item.name, status: "failed", error: `Missing agent ${item.ownerAgent}` });
      continue;
    }

    const description = buildDescription(item);
    const payload = {
      projectId: PROJECT_ID,
      goalId: null,
      parentIssueId: null,
      title: item.name,
      description,
      assigneeAgentId,
      priority: "medium",
      status: "active",
      concurrencyPolicy: "coalesce_if_active",
      catchUpPolicy: "skip_missed",
    };

    let routine = existingByTitle.get(item.name);
    if (!routine) {
      routine = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/routines`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      results.push({ title: item.name, status: "created", routineId: routine.id });
    } else {
      const updated = await requestJson(`${BASE_URL}/api/routines/${routine.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      routine = updated;
      results.push({ title: item.name, status: "updated", routineId: routine.id });
    }

    const detail = await requestJson(`${BASE_URL}/api/routines/${routine.id}`);
    const cronExpression = cronByCadence.get(item.cadence);
    if (!cronExpression) {
      results.push({ title: item.name, status: "warning", error: `No cron mapping for ${item.cadence}` });
      continue;
    }

    const existingSchedule = (detail.triggers || []).find((trigger) => trigger.kind === "schedule");
    const triggerPayload = {
      kind: "schedule",
      label: `${item.name} schedule`,
      enabled: true,
      cronExpression,
      timezone: "Asia/Riyadh",
    };

    if (!existingSchedule) {
      await requestJson(`${BASE_URL}/api/routines/${routine.id}/triggers`, {
        method: "POST",
        body: JSON.stringify(triggerPayload),
      });
    } else {
      await requestJson(`${BASE_URL}/api/routine-triggers/${existingSchedule.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: triggerPayload.label,
          enabled: true,
          cronExpression,
          timezone: "Asia/Riyadh",
        }),
      });
    }
  }

  console.log(JSON.stringify({ companyId: COMPANY_ID, projectId: PROJECT_ID, results }, null, 2));
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
