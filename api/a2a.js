const crypto = require("crypto");

const { answerAgentQuestion } = require("../lib/agent-concierge");
const { recordAgentEvent } = require("../lib/agent-observability");
const { setSecurityHeaders } = require("../lib/security-headers");

const A2A_VERSION = "1.0";
const CONTENT_SIGNAL = "ai-train=no, search=yes, ai-input=yes";
const MAX_BODY_BYTES = 8 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitStore = new Map();

function sendJson(res, statusCode, payload, contentType = "application/a2a+json; charset=utf-8") {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Signal", CONTENT_SIGNAL);
  res.setHeader("A2A-Version", A2A_VERSION);
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  setSecurityHeaders(res, { cache: false });
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload, null, 2));
}

function problem(res, statusCode, type, title, detail, extra = {}) {
  sendJson(res, statusCode, {
    type: `https://a2a-protocol.org/errors/${type}`,
    title,
    status: statusCode,
    detail,
    ...extra,
  }, "application/problem+json; charset=utf-8");
}

function requestPath(req) {
  const action = req.query && req.query.action;
  if (action) return `/api/a2a/${String(action)}`;
  try {
    return new URL(req.url || "/api/a2a", "https://www.stratasaudi.com").pathname;
  } catch (_error) {
    return "/api/a2a";
  }
}

function clientKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const source = forwarded || String(req.socket?.remoteAddress || "unknown");
  return crypto.createHash("sha256").update(`strata-a2a:${source}`).digest("hex");
}

function assertRateLimit(req) {
  const key = clientKey(req);
  const now = Date.now();
  const existing = rateLimitStore.get(key) || [];
  const fresh = existing.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT_MAX_REQUESTS) {
    const error = new Error("Rate limit exceeded.");
    error.statusCode = 429;
    error.retryAfterSeconds = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - fresh[0])) / 1000);
    throw error;
  }
  fresh.push(now);
  rateLimitStore.set(key, fresh);
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalBytes += buffer.length;
    if (totalBytes > MAX_BODY_BYTES) {
      const error = new Error("Request body exceeds the 8 KiB public-agent limit.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch (_error) {
    const error = new Error("Invalid JSON payload.");
    error.statusCode = 400;
    throw error;
  }
}

function extractQuestion(body) {
  const message = body && body.message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw Object.assign(new Error("message is required."), { statusCode: 400 });
  }
  if (message.role !== "ROLE_USER") {
    throw Object.assign(new Error("message.role must be ROLE_USER."), { statusCode: 400 });
  }
  if (!message.messageId || typeof message.messageId !== "string" || message.messageId.length > 128) {
    throw Object.assign(new Error("message.messageId is required and must not exceed 128 characters."), { statusCode: 400 });
  }
  if (message.taskId) {
    throw Object.assign(new Error("Task continuation is not supported by this stateless public concierge."), { statusCode: 400 });
  }
  if (!Array.isArray(message.parts) || message.parts.length < 1 || message.parts.length > 4) {
    throw Object.assign(new Error("message.parts must contain between one and four text parts."), { statusCode: 400 });
  }
  for (const part of message.parts) {
    if (!part || typeof part !== "object" || typeof part.text !== "string") {
      throw Object.assign(new Error("Only text parts are accepted. Files, URLs, raw bytes, and data parts are disabled."), { statusCode: 400 });
    }
    const contentMembers = ["text", "raw", "url", "data"].filter((key) => Object.prototype.hasOwnProperty.call(part, key));
    if (contentMembers.length !== 1) {
      throw Object.assign(new Error("Each part must contain text only."), { statusCode: 400 });
    }
  }
  const acceptedOutputModes = body.configuration && body.configuration.acceptedOutputModes;
  if (
    Array.isArray(acceptedOutputModes) &&
    !acceptedOutputModes.some((mode) => mode === "text/plain" || mode === "application/json")
  ) {
    throw Object.assign(new Error("Supported output modes are text/plain and application/json."), { statusCode: 400 });
  }
  return message.parts.map((part) => part.text).join("\n").trim();
}

function assertRequest(req) {
  const version = String(req.headers["a2a-version"] || "");
  if (version !== A2A_VERSION) {
    const error = new Error(version ? `A2A version ${version} is not supported.` : "A2A-Version: 1.0 is required.");
    error.statusCode = 400;
    error.versionNotSupported = true;
    throw error;
  }
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/a2a+json") && !contentType.includes("application/json")) {
    const error = new Error("Content-Type must be application/a2a+json or application/json.");
    error.statusCode = 415;
    throw error;
  }
}

function publicResponse(result, requestMessage) {
  const contextId =
    typeof requestMessage.contextId === "string" && requestMessage.contextId.length <= 128
      ? requestMessage.contextId
      : crypto.randomUUID();
  return {
    message: {
      messageId: crypto.randomUUID(),
      contextId,
      role: "ROLE_AGENT",
      parts: [
        { text: result.answer, mediaType: "text/plain" },
        {
          data: {
            answerStatus: result.answer_status,
            questionPattern: result.question_pattern,
            fit: result.fit,
            route: result.route,
            matchedService: result.matched_service,
            sources: result.sources,
            publicDataOnly: true,
            rawQuestionStored: false,
            approvalRequiredBeforeContactOrSubmission: true,
          },
          mediaType: "application/json",
        },
      ],
      metadata: {
        stateless: true,
        persistentMemory: false,
        contactOrSubmissionPerformed: false,
      },
    },
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, A2A-Version");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET" && requestPath(req) === "/api/a2a") {
    sendJson(res, 200, {
      name: "Strata Mandate Concierge",
      protocol: "A2A",
      protocolVersion: A2A_VERSION,
      protocolBinding: "HTTP+JSON",
      agentCard: "https://www.stratasaudi.com/.well-known/agent-card.json",
      sendMessage: "https://www.stratasaudi.com/api/a2a/message:send",
      publicDataOnly: true,
      modelProviderEnabled: false,
      persistentMemory: false,
      approvalRequiredBeforeContactOrSubmission: true,
    });
    return;
  }

  if (req.method !== "POST" || requestPath(req) !== "/api/a2a/message:send") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    problem(res, 405, "unsupported-operation", "Unsupported Operation", "Use POST /api/a2a/message:send.");
    return;
  }

  try {
    assertRateLimit(req);
    assertRequest(req);
    const body = await readJsonBody(req);
    const question = extractQuestion(body);
    const result = answerAgentQuestion({ question });

    await recordAgentEvent("agent_question", {
      user_agent: req.headers["user-agent"] || "",
      resource_type: "a2a_concierge",
      resource_path: "/api/a2a/message:send",
      representation: "application/a2a+json",
      fit: result.fit,
      question_topic: result.question_topic,
      question_pattern: result.question_pattern,
      answer_status: result.answer_status,
      matched_service: result.matched_service,
      language: result.language,
      route: result.route,
      question_fingerprint: result.question_fingerprint,
    });

    sendJson(res, 200, publicResponse(result, body.message));
  } catch (error) {
    if (error.retryAfterSeconds) res.setHeader("Retry-After", String(error.retryAfterSeconds));
    if (error.versionNotSupported) {
      problem(res, 400, "version-not-supported", "Protocol Version Not Supported", error.message, {
        supportedVersions: [A2A_VERSION],
      });
      return;
    }
    const statusCode = error.statusCode || (error.code === "QUESTION_TOO_LARGE" ? 413 : 400);
    problem(res, statusCode, "invalid-request", "Invalid Request", error.message || "The request could not be processed.");
  }
};
