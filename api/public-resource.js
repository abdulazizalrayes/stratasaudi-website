const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { recordAgentEvent } = require("../lib/agent-observability");
const { CONTENT_SIGNAL } = require("../lib/markdown-layer");
const { setSecurityHeaders } = require("../lib/security-headers");

const ROOT = path.join(__dirname, "..");
const PUBLIC_RESOURCES = new Map([
  ["/llms.txt", ["llms.txt", "text/plain; charset=utf-8"]],
  ["/llms-full.txt", ["llms-full.txt", "text/plain; charset=utf-8"]],
  ["/openapi.json", ["openapi.json", "application/json; charset=utf-8"]],
  ["/auth.md", ["auth.md", "text/markdown; charset=utf-8"]],
  ["/.well-known/api-catalog", [".well-known/api-catalog", "application/linkset+json; charset=utf-8"]],
  ["/.well-known/ai-catalog.json", [".well-known/ai-catalog.json", "application/json; charset=utf-8"]],
  ["/.well-known/oauth-protected-resource", [".well-known/oauth-protected-resource", "application/json; charset=utf-8"]],
  ["/.well-known/security.txt", [".well-known/security.txt", "text/plain; charset=utf-8"]],
  ["/.well-known/agent-card.json", [".well-known/agent-card.json", "application/json; charset=utf-8"]],
  ["/.well-known/agent-skills/index.json", [".well-known/agent-skills/index.json", "application/json; charset=utf-8"]],
  ["/.well-known/mcp.json", [".well-known/mcp.json", "application/json; charset=utf-8"]],
  ["/.well-known/mcp/server-card.json", [".well-known/mcp/server-card.json", "application/json; charset=utf-8"]],
  ["/.well-known/mcp/server-cards.json", [".well-known/mcp/server-cards.json", "application/json; charset=utf-8"]],
  ...fs.readdirSync(path.join(ROOT, "data"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => [`/data/${file}`, [`data/${file}`, "application/json; charset=utf-8"]]),
]);

function requestPath(req) {
  const routedResource = req.query && req.query.resource;
  if (routedResource) return `/${String(routedResource).replace(/^\/+/, "")}`;
  try {
    return new URL(req.url || "/", "https://www.stratasaudi.com").pathname;
  } catch (_error) {
    return "/";
  }
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.end();
    return;
  }

  const publicPath = requestPath(req);
  const resource = PUBLIC_RESOURCES.get(publicPath);
  if (!resource) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
    return;
  }

  const [relativePath, contentType] = resource;
  const body = fs.readFileSync(path.join(ROOT, relativePath));
  const etag = `\"${crypto.createHash("sha256").update(body).digest("base64url")}\"`;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(body.length));
  res.setHeader("Content-Signal", CONTENT_SIGNAL);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("ETag", etag);
  setSecurityHeaders(res, { cacheControl: "public, max-age=0, must-revalidate" });
  if (publicPath.endsWith(".md")) res.setHeader("X-Robots-Tag", "noindex, follow");

  await recordAgentEvent("agent_resource_read", {
    user_agent: req.headers["user-agent"] || "",
    resource_type: publicPath.startsWith("/data/") ? "structured_data" : "agent_discovery",
    resource_path: publicPath,
    representation: contentType.split(";")[0],
  });

  res.end(req.method === "HEAD" ? "" : body);
};
