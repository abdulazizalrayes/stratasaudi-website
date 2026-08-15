const crypto = require("crypto");

const EVENT_NAMES = new Set([
  "agent_resource_read",
  "crawler_page_read",
  "inquiry_preparation",
  "inquiry_scope_match",
  "mcp_discovery_read",
  "mcp_resource_read",
  "mcp_tool_call",
  "procurement_fit_screen",
]);

function classifyUserAgent(value) {
  const userAgent = String(value || "").toLowerCase();
  if (userAgent.includes("gptbot") || userAgent.includes("chatgpt") || userAgent.includes("oai-searchbot")) return "openai";
  if (userAgent.includes("claudebot") || userAgent.includes("claude-") || userAgent.includes("anthropic")) return "anthropic";
  if (userAgent.includes("perplexity")) return "perplexity";
  if (userAgent.includes("googlebot") || userAgent.includes("google-inspectiontool")) return "google";
  if (userAgent.includes("bingbot")) return "bing";
  if (userAgent.includes("bot") || userAgent.includes("crawler") || userAgent.includes("spider")) return "other_bot";
  return "browser_or_unknown_agent";
}

function safeToken(value, fallback = "") {
  const token = String(value || "").toLowerCase().replace(/[^a-z0-9_./-]/g, "_").slice(0, 100);
  return token || fallback;
}

function aggregateClientId(agentFamily) {
  const day = new Date().toISOString().slice(0, 10);
  const digest = crypto.createHash("sha256").update(`strata:${agentFamily}:${day}`).digest("hex");
  return `${parseInt(digest.slice(0, 8), 16)}.${parseInt(digest.slice(8, 16), 16)}`;
}

async function sendGa4Event(eventType, details) {
  if (process.env.VERCEL_ENV !== "production") return false;
  const measurementId = process.env.GA_MEASUREMENT_ID;
  const apiSecret = process.env.GA_API_SECRET;
  if (!measurementId || !apiSecret) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        client_id: aggregateClientId(details.agent_family),
        non_personalized_ads: true,
        events: [{
          name: eventType,
          params: {
            engagement_time_msec: 1,
            agent_family: details.agent_family,
            resource_type: details.resource_type,
            resource_path: details.resource_path,
            representation: details.representation,
            tool_name: details.tool_name,
            fit: details.fit,
          },
        }],
      }),
    });
    return response.ok;
  } catch (_error) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function recordAgentEvent(eventType, details = {}) {
  const eventName = EVENT_NAMES.has(eventType) ? eventType : "agent_resource_read";
  const agentFamily = details.agent_family || classifyUserAgent(details.user_agent);
  const safeDetails = {
    agent_family: safeToken(agentFamily, "browser_or_unknown_agent"),
    resource_type: safeToken(details.resource_type, "unknown"),
    resource_path: safeToken(details.resource_path || details.path, "unknown"),
    representation: safeToken(details.representation, "unknown"),
    tool_name: safeToken(details.tool_name),
    fit: safeToken(details.fit),
  };

  console.info("strata_agent_readiness_event", {
    event_type: eventName,
    at: new Date().toISOString(),
    ...safeDetails,
  });
  await sendGa4Event(eventName, safeDetails);
  return safeDetails;
}

module.exports = {
  classifyUserAgent,
  recordAgentEvent,
};
