#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const EXPECTED_PROJECT = {
  projectId: "prj_G5hsWnWwyIVPnLjGb9sf8eCGj3Lj",
  projectName: "stratasaudi-website",
  canonicalDomain: "www.stratasaudi.com",
};

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function assertProjectLock() {
  const projectPath = path.join(ROOT, ".vercel", "project.json");
  const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
  if (project.projectId !== EXPECTED_PROJECT.projectId || project.projectName !== EXPECTED_PROJECT.projectName) {
    throw new Error("Refusing to read logs: the linked Vercel project is not Strata Saudi.");
  }
}

function vercelCommand() {
  const name = process.platform === "win32" ? "vercel.cmd" : "vercel";
  const binary = path.join(ROOT, "node_modules", ".bin", name);
  if (fs.existsSync(binary)) return { command: binary, prefix: [] };
  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    prefix: ["--yes", "vercel@50.41.0"],
  };
}

function readProductionLogs() {
  const inputPath = argument("--input");
  if (inputPath) return { source: "approved local fixture", raw: fs.readFileSync(path.resolve(inputPath), "utf8") };

  assertProjectLock();
  const since = argument("--since", "7d");
  const limit = Number(argument("--limit", "5000"));
  if (!/^\d+[mhdw]$/.test(since)) throw new Error("--since must use a bounded value such as 24h or 7d.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error("--limit must be between 1 and 5000.");

  const vercel = vercelCommand();
  const result = spawnSync(vercel.command, [
    ...vercel.prefix, "logs",
    "--project", EXPECTED_PROJECT.projectName,
    "--environment", "production",
    "--since", since,
    "--limit", String(limit),
    "--json",
    "--no-branch",
    "--no-follow",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120 * 1000,
  });
  if (result.error && result.error.code === "ETIMEDOUT") {
    throw new Error("Vercel production log retrieval exceeded the two-minute safety limit.");
  }
  if (result.status !== 0) throw new Error("Vercel production logs could not be read with the currently authenticated account.");
  return { source: `Vercel production runtime logs (${since})`, raw: result.stdout };
}

function parseLogLines(raw) {
  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch (_error) {
      return { message: line };
    }
  });
}

function validateProductionScope(entries, fixtureMode) {
  if (fixtureMode) return;
  for (const entry of entries) {
    if (entry.projectId && entry.projectId !== EXPECTED_PROJECT.projectId) {
      throw new Error("Refusing mixed-company logs: a non-Strata project id was returned.");
    }
    if (entry.environment && entry.environment !== "production") {
      throw new Error("Refusing non-production logs in the Strata owner report.");
    }
  }
}

function domainSummary(entries) {
  return {
    canonical_domain_entries: entries.filter((entry) => entry.domain === EXPECTED_PROJECT.canonicalDomain).length,
    other_same_project_domain_entries: entries.filter(
      (entry) => entry.domain && entry.domain !== EXPECTED_PROJECT.canonicalDomain,
    ).length,
  };
}

function runReport(scriptName, raw) {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", scriptName)], {
    cwd: ROOT,
    input: raw,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${scriptName} failed.`);
  return JSON.parse(result.stdout);
}

function warningSummary(entries) {
  const summary = {
    node_url_parse_deprecation: 0,
    other_error_entries: 0,
  };
  for (const entry of entries) {
    if (entry.level !== "error") continue;
    const message = String(entry.message || "");
    if (message.includes("[DEP0169]") && message.includes("url.parse()")) {
      summary.node_url_parse_deprecation += 1;
    } else {
      summary.other_error_entries += 1;
    }
  }
  return summary;
}

function main() {
  const input = readProductionLogs();
  const entries = parseLogLines(input.raw);
  validateProductionScope(entries, input.source === "approved local fixture");

  const deployments = [...new Set(entries.map((entry) => entry.deploymentId).filter(Boolean))];
  const report = {
    generated_at: new Date().toISOString(),
    company: "Strata Risk Advisory",
    canonical_domain: "https://www.stratasaudi.com",
    source: input.source,
    source_entries: entries.length,
    deployment_ids: deployments,
    domain_scope: domainSummary(entries),
    classification: "Observed agent and crawler activity is not automatically a verified lead.",
    observability: runReport("report-agent-observability.js", input.raw),
    agent_questions: runReport("report-agent-questions.js", input.raw),
    runtime_warnings: warningSummary(entries),
    privacy: {
      raw_logs_persisted_by_this_script: false,
      raw_questions_retained: false,
      personal_or_confidential_fields_reported: false,
      report_uses_fixed_question_patterns: true,
    },
  };
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
