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

function readHeader(entry, name) {
  const headers = entry.headers || entry.requestHeaders || {};
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === lower) return String(value || "");
  }
  return String(entry[name] || entry[lower] || "");
}

function requestPath(entry) {
  const raw = entry.requestPath || entry.path || entry.url || entry.requestUrl || "";
  if (!raw) return "";
  try {
    return new URL(raw, "https://www.stratasaudi.com").pathname;
  } catch (_error) {
    return String(raw).split("?")[0];
  }
}

function isMarkdownSidecar(path) {
  return /^\/(?:index|about|services|counterparties|why-saudi|insights|faq|ethics|contact|privacy|terms|mandate-checklist|fidic-claims-saudi-arabia)\.md$/.test(path);
}

function isAgentDiscoveryPath(path) {
  return /^(?:\/llms(?:-full)?\.txt|\/openapi\.json|\/auth\.md|\/api\/mcp|\/\.well-known\/|\/data\/)/.test(path);
}

function extractAgentEvent(entry) {
  const message = typeof entry.message === "string" ? entry.message : "";
  if (!message.includes("strata_agent_readiness_event")) return null;
  const eventTypeMatch = message.match(/event_type['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_/-]+)/);
  const toolMatch = message.match(/tool_name['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_/-]+)/);
  const resourceMatch = message.match(/resource_id['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_/-]+)/);
  const fitMatch = message.match(/fit['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_/-]+)/);
  const familyMatch = message.match(/agent_family['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_/-]+)/);
  const typeMatch = message.match(/resource_type['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_./-]+)/);
  const pathMatch = message.match(/resource_path['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_./-]+)/);
  const questionTopicMatch = message.match(/question_topic['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_./-]+)/);
  const questionPatternMatch = message.match(/question_pattern['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_./-]+)/);
  const answerStatusMatch = message.match(/answer_status['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_./-]+)/);
  const routeMatch = message.match(/route['"]?\s*[:=]\s*['"]?([a-zA-Z0-9_./-]+)/);
  return {
    event_type: eventTypeMatch ? eventTypeMatch[1] : "strata_agent_readiness_event",
    tool_name: toolMatch ? toolMatch[1] : "",
    resource_id: resourceMatch ? resourceMatch[1] : "",
    fit: fitMatch ? fitMatch[1] : "",
    agent_family: familyMatch ? familyMatch[1] : "",
    resource_type: typeMatch ? typeMatch[1] : "",
    user_agent: entry.userAgent || entry.user_agent || "",
    path: pathMatch ? pathMatch[1] : entry.requestPath || entry.path || "",
    question_topic: questionTopicMatch ? questionTopicMatch[1] : "",
    question_pattern: questionPatternMatch ? questionPatternMatch[1] : "",
    answer_status: answerStatusMatch ? answerStatusMatch[1] : "",
    route: routeMatch ? routeMatch[1] : "",
  };
}

function main() {
  const entries = parseLines(readInput());
  const report = {
    generated_at: new Date().toISOString(),
    source_entries: entries.length,
    agent_events: 0,
    reads_by_path: {},
    markdown_negotiated_reads: {},
    markdown_sidecar_reads: {},
    discovery_reads: {},
    openapi_reads: 0,
    llms_reads: 0,
    mcp_reads: 0,
    tool_calls: {},
    resource_reads: {},
    fit_classifications: {},
    question_topics: {},
    question_patterns: {},
    answer_statuses: {},
    concierge_routes: {},
    event_user_agent_families: {},
    resource_types: {},
    user_agent_families: {},
    crawler_or_agent_reads: {},
    notes: [
      "Report is privacy-safe: it summarizes paths, tool names, resource ids, fit classes, and user-agent families only.",
      "Do not add names, emails, message bodies, or confidential project facts to this report.",
      "Concierge question reporting uses fixed pattern ids only; raw questions are neither expected nor reported."
    ]
  };

  for (const entry of entries) {
    const path = requestPath(entry);
    const userAgent = entry.userAgent || entry.user_agent || "";
    const accept = readHeader(entry, "accept").toLowerCase();
    if (path) increment(report.reads_by_path, path);
    increment(report.user_agent_families, classifyUserAgent(userAgent));

    if (accept.includes("text/markdown")) increment(report.markdown_negotiated_reads, path || "unknown");
    if (isMarkdownSidecar(path)) increment(report.markdown_sidecar_reads, path);
    if (isAgentDiscoveryPath(path)) {
      increment(report.discovery_reads, path);
      increment(report.crawler_or_agent_reads, path);
    }
    if (path === "/openapi.json") report.openapi_reads += 1;
    if (path === "/llms.txt" || path === "/llms-full.txt") report.llms_reads += 1;
    if (path === "/api/mcp" || path.startsWith("/.well-known/mcp")) report.mcp_reads += 1;

    const event = extractAgentEvent(entry);
    if (!event) continue;
    report.agent_events += 1;
    increment(report.tool_calls, event.tool_name || event.event_type);
    increment(report.resource_reads, event.resource_id);
    increment(report.fit_classifications, event.fit);
    increment(report.event_user_agent_families, event.agent_family);
    increment(report.resource_types, event.resource_type);
    increment(report.question_topics, event.question_topic);
    increment(report.question_patterns, event.question_pattern);
    increment(report.answer_statuses, event.answer_status);
    increment(report.concierge_routes, event.route);
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
