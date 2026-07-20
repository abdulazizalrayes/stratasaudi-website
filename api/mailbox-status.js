const { checkMailboxHealth } = require("../lib/private-email-client");

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function allowedOrigin(origin, host) {
  if (
    origin &&
    (/^https:\/\/([a-z0-9-]+\.)*stratasaudi\.com$/i.test(origin) ||
      /^https?:\/\/localhost(?::\d+)?$/i.test(origin) ||
      (/\.vercel\.app$/i.test(String(host || "")) &&
        origin.toLowerCase() === `https://${String(host).toLowerCase()}`))
  ) {
    return origin;
  }
  return "https://www.stratasaudi.com";
}

function sanitize(value, maxLength) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength || 4000);
}

function readBearerToken(req) {
  const header = sanitize(req.headers.authorization, 4000);
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return sanitize(header.slice(7), 255);
}

function isAuthorized(req) {
  const expected =
    sanitize(process.env.STRATA_OPS_TOKEN, 255) ||
    sanitize(process.env.MAILBOX_STATUS_TOKEN, 255);
  if (!expected) return false;
  const presented =
    readBearerToken(req) ||
    sanitize(req.headers["x-strata-ops-token"], 255);
  return Boolean(presented) && presented === expected;
}

module.exports = async (req, res) => {
  const origin = allowedOrigin(req.headers.origin || "", req.headers.host || "");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Strata-Ops-Token");
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  if (!isAuthorized(req)) {
    json(res, 401, { ok: false, error: "Unauthorized." });
    return;
  }

  try {
    const health = await checkMailboxHealth();
    json(res, 200, health);
  } catch (error) {
    json(res, 500, {
      ok: false,
      error: error.message,
    });
  }
};
