const fs = require("fs");

function readInput() {
  if (process.argv[2]) return fs.readFileSync(process.argv[2], "utf8");
  return fs.readFileSync(0, "utf8");
}

function parseLines(input) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return { message: line };
      }
    });
}

function increment(map, key) {
  const safeKey = key || "unknown";
  map[safeKey] = (map[safeKey] || 0) + 1;
}

function classifyUserAgent(value) {
  const userAgent = String(value || "").toLowerCase();
  if (!userAgent) return "unknown";
  if (userAgent.includes("gptbot") || userAgent.includes("chatgpt")) return "openai";
  if (userAgent.includes("claudebot") || userAgent.includes("anthropic")) return "anthropic";
  if (userAgent.includes("perplexity")) return "perplexity";
  if (userAgent.includes("googlebot") || userAgent.includes("google-inspectiontool")) return "google";
  if (userAgent.includes("bingbot")) return "bing";
  if (userAgent.includes("bot") || userAgent.includes("crawler") || userAgent.includes("spider")) return "other_bot";
  return "browser_or_unknown_agent";
}

function extractAgentEvent(entry) {
  const message = typeof entry.message === "string" ? entry.message : "";
  if (!message.includes("strata_agent_readiness_event")) return null;
  const eventTypeMatch = message.match(/event_type['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_/-]+)/);
  const toolMatch = message.match(/tool_name['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_/-]+)/);
  const resourceMatch = message.match(/resource_id['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_/-]+)/);
  const fitMatch = message.match(/fit['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_/-]+)/);
  return {
    event_type: eventTypeMatch ? eventTypeMatch[1] : "strata_agent_readiness_event",
    tool_name: toolMatch ? toolMatch[1] : "",
    resource_id: resourceMatch ? resourceMatch[1] : "",
    fit: fitMatch ? fitMatch[1] : "",
    user_agent: entry.userAgent || entry.user_agent || "",
    path: entry.requestPath || entry.path || "",
  };
}

function main() {
  const entries = parseLines(readInput());
  const report = {
    generated_at: new Date().toISOString(),
    source_entries: entries.length,
    agent_events: 0,
    reads_by_path: {},
    tool_calls: {},
    resource_reads: {},
    fit_classifications: {},
    user_agent_families: {},
    crawler_or_agent_reads: {},
    notes: [
      "Report is privacy-safe: it summarizes paths, tool names, resource ids, fit classes, and user-agent families only.",
      "Do not add names, emails, message bodies, or confidential project facts to this report."
    ]
  };

  for (const entry of entries) {
    const path = entry.requestPath || entry.path || "";
    const userAgent = entry.userAgent || entry.user_agent || "";
    if (path) increment(report.reads_by_path, path);
    increment(report.user_agent_families, classifyUserAgent(userAgent));

    if (/llms|openapi|agent-card|mcp|\/data\//.test(path)) {
      increment(report.crawler_or_agent_reads, path);
    }

    const event = extractAgentEvent(entry);
    if (!event) continue;
    report.agent_events += 1;
    increment(report.tool_calls, event.tool_name || event.event_type);
    increment(report.resource_reads, event.resource_id);
    increment(report.fit_classifications, event.fit);
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
