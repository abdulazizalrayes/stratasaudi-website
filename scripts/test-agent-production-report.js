#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.join(__dirname, "..");
const fixture = path.join(root, "tests", "fixtures", "agent-production-logs.jsonl");
const result = spawnSync(process.execPath, [path.join(__dirname, "report-agent-production.js"), "--input", fixture], {
  cwd: root,
  encoding: "utf8",
});

if (result.status !== 0) throw new Error(result.stderr || "Production report test failed.");
const report = JSON.parse(result.stdout);
const serialized = JSON.stringify(report);

expect(report.company === "Strata Risk Advisory", "company identity lock is missing");
expect(report.agent_questions.questions_observed === 2, "question count mismatch");
expect(report.agent_questions.knowledge_gaps === 1, "knowledge-gap count mismatch");
expect(
  report.agent_questions.by_representative_question["Which engineering-led advisory services does Strata provide?"] === 1,
  "representative service question is missing",
);
expect(report.runtime_warnings.node_url_parse_deprecation === 1, "runtime warning classification mismatch");
expect(report.privacy.raw_questions_retained === false, "raw-question retention must remain disabled");
expect(!serialized.includes("strata_agent_readiness_event"), "report must not reproduce raw log messages");
expect(!serialized.includes("requestPath"), "report must not reproduce raw request records");

console.log(JSON.stringify({
  ok: true,
  productionScopeLocked: true,
  representativeQuestionsReported: true,
  knowledgeGapsReported: true,
  rawLogsPersisted: false,
}, null, 2));
