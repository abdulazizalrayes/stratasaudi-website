const fs = require("fs");
const path = require("path");

const TAXONOMY = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "agent-question-taxonomy.json"), "utf8"),
);

function readInput() {
  if (process.argv[2]) return fs.readFileSync(process.argv[2], "utf8");
  return fs.readFileSync(0, "utf8");
}

function parseLines(input) {
  return input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function field(message, name) {
  const match = String(message || "").match(new RegExp(`${name}['\"]?\\s*[:=]\\s*['\"]?([a-zA-Z0-9_./-]+)`));
  return match ? match[1] : "";
}

function increment(map, key) {
  map[key || "unknown"] = (map[key || "unknown"] || 0) + 1;
}

function main() {
  const patterns = new Map(TAXONOMY.question_patterns.map((item) => [item.id, item]));
  const report = {
    generated_at: new Date().toISOString(),
    questions_observed: 0,
    by_representative_question: {},
    by_topic: {},
    by_answer_status: {},
    by_fit: {},
    by_route: {},
    by_language: {},
    knowledge_gaps: 0,
    recommendations: [],
    privacy: "Raw questions, names, emails, phone numbers, message bodies, IP addresses, and confidential project facts are not included or retained by this report.",
  };

  for (const line of parseLines(readInput())) {
    if (!line.includes("strata_agent_readiness_event") || !line.includes("agent_question")) continue;
    const patternId = field(line, "question_pattern");
    const pattern = patterns.get(patternId);
    report.questions_observed += 1;
    increment(report.by_representative_question, pattern ? pattern.representative_question : "Unknown public question pattern");
    increment(report.by_topic, field(line, "question_topic"));
    increment(report.by_answer_status, field(line, "answer_status"));
    increment(report.by_fit, field(line, "fit"));
    increment(report.by_route, field(line, "route"));
    increment(report.by_language, field(line, "language"));
    if (patternId === "public_knowledge_gap") report.knowledge_gaps += 1;
  }

  if (report.knowledge_gaps > 0) {
    report.recommendations.push("Review public_knowledge_gap volume and approve new public answers only when the underlying facts can be verified without exposing confidential information.");
  }
  if (report.questions_observed === 0) {
    report.recommendations.push("No agent-question log entries were supplied. Export Strata production function logs before treating this as zero demand.");
  }
  console.log(JSON.stringify(report, null, 2));
}

main();
