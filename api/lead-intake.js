const net = require("net");
const tls = require("tls");
const { hasHubSpotConfig, syncLeadToHubSpot } = require("../lib/hubspot-client");
const { APPROVED_BUSINESS_MAILBOX } = require("../lib/private-email-client");

const MAX_BODY_BYTES = 32 * 1024;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const rateLimitStore = new Map();
const ALLOWED_MANDATE_TYPES = new Set([
  "pre_contract_risk_review",
  "project_risk_oversight",
  "pre_litigation_advisory",
  "technical_opinion",
  "vendor_risk_assessment",
  "board_risk_briefing",
]);
const ALLOWED_COUNTERPARTY_TYPES = new Set([
  "epc",
  "developer",
  "law_firm",
  "investor",
  "board",
  "other",
]);
const ALLOWED_URGENCY = new Set(["immediate", "this_month", "this_quarter", "monitoring"]);
const ALLOWED_PROJECT_VALUE_BANDS = new Set([
  "under_50m",
  "50m_250m",
  "250m_500m",
  "500m_plus",
]);
const ALLOWED_PROJECT_STAGES = new Set([
  "pre_tender",
  "tender",
  "pre_contract_award",
  "live_project",
  "claim_dispute_pre_litigation",
]);

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sanitize(value, maxLength) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength || 4000);
}

function assertApprovedBusinessMailbox(value, label) {
  const normalized = sanitize(value, 255).toLowerCase();
  if (!normalized) {
    throw new Error(`${label} is not configured.`);
  }
  if (normalized !== APPROVED_BUSINESS_MAILBOX) {
    throw new Error(
      `${label} must use the approved Strata business mailbox ${APPROVED_BUSINESS_MAILBOX}.`,
    );
  }
  return normalized;
}

function sanitizeBoolean(value) {
  return value === true || value === "true";
}

function sanitizeEnum(value, allowedValues) {
  const normalized = sanitize(value, 255);
  if (!normalized) return "";
  return allowedValues.has(normalized) ? normalized : "";
}

function normalizeTouchpoint(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    source: sanitize(value.source, 255),
    medium: sanitize(value.medium, 255),
    campaign: sanitize(value.campaign, 255),
    content: sanitize(value.content, 255),
    term: sanitize(value.term, 255),
    referrer: sanitize(value.referrer, 1000),
    landing_page: sanitize(value.landing_page, 1000),
    captured_at: sanitize(value.captured_at, 255),
  };
}

function isAllowedOrigin(origin, host) {
  if (!origin) return true;
  if (/^https?:\/\/localhost(?::\d+)?$/i.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin)) return true;
  if (/^https:\/\/([a-z0-9-]+\.)*stratasaudi\.com$/i.test(origin)) return true;
  if (
    host &&
    /\.vercel\.app$/i.test(host) &&
    origin.toLowerCase() === `https://${String(host).toLowerCase()}`
  ) {
    return true;
  }
  return false;
}

function getCorsOrigin(origin, host) {
  if (origin && isAllowedOrigin(origin, host)) return origin;
  return "https://www.stratasaudi.com";
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return forwarded[0] || sanitize(req.socket?.remoteAddress, 255) || "unknown";
}

function assertRateLimit(req) {
  const key = clientIp(req);
  const now = Date.now();
  const existing = rateLimitStore.get(key) || [];
  const fresh = existing.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil(
      (RATE_LIMIT_WINDOW_MS - (now - fresh[0])) / 1000,
    );
    const error = new Error("Too many lead-intake attempts. Please retry later.");
    error.statusCode = 429;
    error.retryAfterSeconds = retryAfterSeconds;
    throw error;
  }
  fresh.push(now);
  rateLimitStore.set(key, fresh);
}

function assertJsonRequest(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    const error = new Error("Content-Type must be application/json.");
    error.statusCode = 415;
    throw error;
  }
}

function normalizePublicUrl(value) {
  const raw = sanitize(value, 1000);
  if (!raw) return "";
  try {
    const parsed = new URL(raw, "https://www.stratasaudi.com");
    if (
      parsed.protocol === "https:" &&
      /^([a-z0-9-]+\.)*stratasaudi\.com$/i.test(parsed.hostname)
    ) {
      return parsed.toString();
    }
  } catch (_error) {}
  return "";
}

function normalizeGa4ClientId(value) {
  const raw = sanitize(value, 255);
  if (raw) return raw;
  return generateRandomClientId();
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalBytes += buffer.length;
    if (totalBytes > MAX_BODY_BYTES) {
      const error = new Error("Payload too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_error) {
    const error = new Error("Invalid JSON payload.");
    error.statusCode = 400;
    throw error;
  }
}

function leadScore(payload) {
  let score = 0;
  const premiumMandates = {
    pre_contract_risk_review: 22,
    project_risk_oversight: 25,
    pre_litigation_advisory: 25,
    technical_opinion: 20,
    vendor_risk_assessment: 16,
    board_risk_briefing: 18,
  };
  const urgencyWeights = { immediate: 16, this_month: 10, this_quarter: 6, monitoring: 2 };
  const counterpartyWeights = { epc: 16, developer: 14, law_firm: 15, investor: 13, board: 13, other: 6 };
  score += premiumMandates[payload.mandateType] || 6;
  score += urgencyWeights[payload.urgency] || 0;
  score += counterpartyWeights[payload.counterpartyType] || 0;
  if (payload.projectValueBand === "500m_plus") score += 12;
  if (payload.confidentialityRequired) score += 4;
  if (payload.conflictCheckAcknowledged) score += 3;
  return Math.min(score, 100);
}

function validate(payload) {
   const errors = {};
   if (!payload.name) errors.name = "Please provide your full name.";
   if (!payload.email) errors.email = "Please provide your business email address.";
   if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
     errors.email = "Please enter a valid email format.";
   }
   if (!payload.company) errors.company = "Please provide your company or organization name.";
   if (!payload.country) errors.country = "Please select your country of operation.";
   if (!payload.mandateType) errors.mandateType = "Please specify the type of mandate you're seeking.";
   if (!payload.counterpartyType) errors.counterpartyType = "Please identify your counterparty category.";
   if (!payload.message) errors.message = "Please describe your project exposure and the judgment you require.";
   if (!payload.conflictCheckAcknowledged) {
     errors.conflictCheckAcknowledged = "Please acknowledge that mandate review is subject to conflict and fit checks.";
   }
   if (payload.mandateType && !ALLOWED_MANDATE_TYPES.has(payload.mandateType)) {
     errors.mandateType = "Please choose a valid mandate type.";
   }
   if (payload.counterpartyType && !ALLOWED_COUNTERPARTY_TYPES.has(payload.counterpartyType)) {
     errors.counterpartyType = "Please choose a valid counterparty category.";
   }
   if (payload.urgency && !ALLOWED_URGENCY.has(payload.urgency)) {
     errors.urgency = "Please choose a valid urgency level.";
   }
   if (payload.projectValueBand && !ALLOWED_PROJECT_VALUE_BANDS.has(payload.projectValueBand)) {
     errors.projectValueBand = "Please choose a valid project value band.";
   }
   if (payload.projectStage && !ALLOWED_PROJECT_STAGES.has(payload.projectStage)) {
     errors.projectStage = "Please choose a valid project stage.";
   }
   return errors;
 }

function buildClientCookie(name, value) {
  return (
    `${name}=${encodeURIComponent(String(value))}; Path=/; Max-Age=300; SameSite=Strict; Secure`
  );
}

function serializeTouchpoint(label, touchpoint) {
  if (!touchpoint) return [];
  return [
    [`${label} source`, touchpoint.source || "direct / unknown"],
    [`${label} medium`, touchpoint.medium || ""],
    [`${label} campaign`, touchpoint.campaign || ""],
    [`${label} referrer`, touchpoint.referrer || ""],
    [`${label} landing page`, touchpoint.landing_page || ""],
    [`${label} captured at`, touchpoint.captured_at || ""],
  ];
}

function buildMessage(payload) {
  const rows = [
    ["Submitted at", new Date().toISOString()],
    ["Name", payload.name],
    ["Email", payload.email],
    ["Role", payload.role || ""],
    ["Company", payload.company],
    ["Country", payload.country],
    ["Counterparty type", payload.counterpartyType],
    ["Mandate type", payload.mandateType],
    ["Project stage", payload.projectStage || ""],
    ["Project value band", payload.projectValueBand || ""],
    ["Urgency", payload.urgency || ""],
    ["Confidentiality required", payload.confidentialityRequired ? "Yes" : "No"],
    ["Conflict acknowledgement", payload.conflictCheckAcknowledged ? "Yes" : "No"],
    ["Lead source", payload.leadSource || "website_confidential_enquiry"],
    ["Page URL", payload.pageUrl || "https://www.stratasaudi.com/contact"],
    ["Session ID", payload.sessionId || ""],
    ["Referrer", payload.referrer || ""],
    ["User agent", payload.userAgent || "unknown"],
    ["Lead score", String(payload.leadScore)],
    ...serializeTouchpoint("First touch", payload.firstTouch),
    ...serializeTouchpoint("Latest touch", payload.latestTouch),
  ];

  const text = [
    "New Strata Saudi confidential enquiry",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Context:",
    payload.message,
  ].join("\n");

  const html =
    '<h2>New Strata Saudi confidential enquiry</h2>' +
    '<table cellspacing="0" cellpadding="8" border="1" style="border-collapse:collapse;border-color:#ddd;"><tbody>' +
    rows
      .map(([label, value]) => {
        return `<tr><th align="left" style="background:#f7f7f7;">${label}</th><td>${String(
          value || "",
        )
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</td></tr>`;
      })
      .join("") +
    "</tbody></table>" +
    `<h3>Context</h3><p>${payload.message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>")}</p>`;

  return { text, html };
}

function encodeHeader(value) {
  const text = sanitize(value, 500);
  if (/^[\x20-\x7e]*$/.test(text)) return text.replace(/[\r\n]+/g, " ");
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function smtpAddress(value) {
  const address = sanitize(value, 255);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) {
    throw new Error("Invalid email address for SMTP envelope.");
  }
  return address;
}

function dotStuff(value) {
  return String(value || "")
    .replace(/\r?\n/g, "\r\n")
    .replace(/^\./gm, "..");
}

function buildRawEmail({ from, to, replyTo, subject, text, html }) {
  const boundary = `strata-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return [
    `From: "Strata Saudi Website" <${smtpAddress(from)}>`,
    `To: <${smtpAddress(to)}>`,
    `Reply-To: <${smtpAddress(replyTo)}>`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    dotStuff(text),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    dotStuff(html),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function createLineReader(socket) {
  let buffer = "";
  const waiters = [];

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    flush();
  });

  function flush() {
    while (waiters.length > 0) {
      const index = buffer.indexOf("\n");
      if (index < 0) return;
      const line = buffer.slice(0, index + 1);
      buffer = buffer.slice(index + 1);
      waiters.shift()(line.replace(/\r?\n$/, ""));
    }
  }

  return function readLine() {
    return new Promise((resolve) => {
      waiters.push(resolve);
      flush();
    });
  };
}

async function readSmtpResponse(readLine) {
  const lines = [];
  while (true) {
    const line = await readLine();
    lines.push(line);
    if (/^\d{3} /.test(line)) break;
  }
  const code = Number(lines[0].slice(0, 3));
  return { code, message: lines.join("\n") };
}

async function expectSmtp(readLine, expectedCodes, commandLabel) {
  const response = await readSmtpResponse(readLine);
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`${commandLabel} failed with SMTP ${response.code}: ${response.message}`);
  }
  return response;
}

function writeSmtp(socket, command) {
  socket.write(`${command}\r\n`);
}

function connectSmtp({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    socket.once("connect", () => resolve(socket));
    socket.once("secureConnect", () => resolve(socket));
    socket.once("error", reject);
    socket.setTimeout(15000, () => {
      socket.destroy(new Error("SMTP connection timed out."));
    });
  });
}

async function sendSmtpMail({ host, port, secure, user, pass, from, to, replyTo, subject, text, html }) {
  let socket = await connectSmtp({ host, port, secure });
  let readLine = createLineReader(socket);

  try {
    await expectSmtp(readLine, [220], "SMTP greeting");
    writeSmtp(socket, "EHLO www.stratasaudi.com");
    await expectSmtp(readLine, [250], "EHLO");

    if (!secure && port === 587) {
      writeSmtp(socket, "STARTTLS");
      await expectSmtp(readLine, [220], "STARTTLS");
      socket = tls.connect({ socket, servername: host });
      readLine = createLineReader(socket);
      writeSmtp(socket, "EHLO www.stratasaudi.com");
      await expectSmtp(readLine, [250], "EHLO after STARTTLS");
    }

    writeSmtp(socket, "AUTH LOGIN");
    await expectSmtp(readLine, [334], "AUTH LOGIN");
    writeSmtp(socket, Buffer.from(user, "utf8").toString("base64"));
    await expectSmtp(readLine, [334], "SMTP username");
    writeSmtp(socket, Buffer.from(pass, "utf8").toString("base64"));
    await expectSmtp(readLine, [235], "SMTP password");

    writeSmtp(socket, `MAIL FROM:<${smtpAddress(from)}>`);
    await expectSmtp(readLine, [250], "MAIL FROM");
    writeSmtp(socket, `RCPT TO:<${smtpAddress(to)}>`);
    await expectSmtp(readLine, [250, 251], "RCPT TO");
    writeSmtp(socket, "DATA");
    await expectSmtp(readLine, [354], "DATA");
    socket.write(`${buildRawEmail({ from, to, replyTo, subject, text, html })}\r\n.\r\n`);
    await expectSmtp(readLine, [250], "message body");
    writeSmtp(socket, "QUIT");
  } finally {
    socket.end();
  }
}

async function sendLeadEmail(payload) {
  const host =
    sanitize(process.env.SMTP_HOST, 255) ||
    sanitize(process.env.PRIVATE_EMAIL_SMTP_HOST, 255) ||
    "mail.privateemail.com";
  const port = Number(
    sanitize(process.env.SMTP_PORT, 8) || sanitize(process.env.PRIVATE_EMAIL_SMTP_PORT, 8) || 465,
  );
  const secureSource =
    sanitize(process.env.SMTP_SECURE, 8) || sanitize(process.env.PRIVATE_EMAIL_SMTP_SECURE, 8);
  const secure = secureSource ? secureSource.toLowerCase() !== "false" : true;
  const user =
    sanitize(process.env.SMTP_USER, 255) ||
    sanitize(process.env.PRIVATE_EMAIL_SMTP_USER, 255) ||
    sanitize(process.env.CONTACT_EMAIL, 255);
  const pass =
    sanitize(process.env.SMTP_PASS, 255) || sanitize(process.env.PRIVATE_EMAIL_SMTP_PASS, 255);
  const approvedUser = assertApprovedBusinessMailbox(user, "SMTP_USER");
  const destination = assertApprovedBusinessMailbox(
    sanitize(process.env.CONTACT_DESTINATION, 255) || APPROVED_BUSINESS_MAILBOX,
    "CONTACT_DESTINATION",
  );
  const fromAddress = assertApprovedBusinessMailbox(
    sanitize(process.env.CONTACT_FROM, 255) || approvedUser || destination,
    "CONTACT_FROM",
  );

  if (!host || !user || !pass) {
    throw new Error("SMTP credentials are not configured.");
  }

  const { text, html } = buildMessage(payload);
  await sendSmtpMail({
    host,
    port,
    secure,
    user: approvedUser,
    pass,
    from: fromAddress,
    to: destination,
    replyTo: payload.email,
    subject: `New Strata Saudi enquiry from ${payload.company}`,
    text,
    html,
  });
}

async function sendWebhook(payload) {
  const webhookUrl = sanitize(process.env.CRM_WEBHOOK_URL, 2000);
  if (!webhookUrl) return;

  const headers = { "Content-Type": "application/json" };
  const token = sanitize(process.env.CRM_WEBHOOK_TOKEN, 255);
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event: "strata_confidential_enquiry",
      submittedAt: new Date().toISOString(),
      payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`CRM webhook failed with status ${response.status}`);
  }
}

async function sendHubSpot(payload) {
  if (!hasHubSpotConfig()) return;
  await syncLeadToHubSpot(payload);
}

async function sendGa4MeasurementProtocolEvent(payload) {
  const measurementId = process.env.GA_MEASUREMENT_ID;
  const apiSecret = process.env.GA_API_SECRET;
  
  if (!measurementId || !apiSecret) {
    // Silently fail if not configured - don't break lead submission
    return;
  }

  try {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    
    const clientId = normalizeGa4ClientId(payload.sessionId);
    const eventData = {
      client_id: clientId,
      events: [{
        name: "lead_submission",
        timestamp_micros: Date.now() * 1000,
        params: {
          session_id: clientId,
          engagement_time_msec: 1,
          lead_score: payload.leadScore,
          mandate_type: payload.mandateType,
          urgency: payload.urgency,
          confidentiality_required: payload.confidentialityRequired ? 1 : 0,
          country: payload.country,
          counterparty_type: payload.counterpartyType,
          project_value_band: payload.projectValueBand || "",
          source: (payload.firstTouch && payload.firstTouch.source) || "",
          medium: (payload.firstTouch && payload.firstTouch.medium) || "",
          campaign: (payload.firstTouch && payload.firstTouch.campaign) || "",
          term: (payload.firstTouch && payload.firstTouch.term) || "",
          content: (payload.firstTouch && payload.firstTouch.content) || "",
          form_page: payload.pageUrl || "https://www.stratasaudi.com/contact"
        }
      }]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    });

    if (!response.ok) {
      console.warn('GA4 Measurement Protocol event failed:', response.status, response.statusText);
    }
  } catch (error) {
    // Don't break lead submission if analytics fails
    console.warn('Failed to send GA4 Measurement Protocol event:', error.message);
  }
}

function generateRandomClientId() {
  // Generate a random client ID similar to GA4's format
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

module.exports = async (req, res) => {
  const requestOrigin = String(req.headers.origin || "");
  const requestHost = String(req.headers.host || "");
  const allowedOrigin = getCorsOrigin(requestOrigin, requestHost);
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  try {
    if (!isAllowedOrigin(requestOrigin, requestHost)) {
      json(res, 403, { ok: false, error: "Origin not allowed." });
      return;
    }
    assertRateLimit(req);
    assertJsonRequest(req);

    const body = await readJsonBody(req);
    if (body.website) {
      json(res, 200, { ok: true });
      return;
    }

    const payload = {
      name: sanitize(body.name, 255),
      email: sanitize(body.email, 255),
      role: sanitize(body.role, 255),
      company: sanitize(body.company, 255),
      country: sanitize(body.country, 255),
      counterpartyType: sanitizeEnum(body.counterpartyType, ALLOWED_COUNTERPARTY_TYPES),
      mandateType: sanitizeEnum(body.mandateType, ALLOWED_MANDATE_TYPES),
      projectStage: sanitizeEnum(body.projectStage, ALLOWED_PROJECT_STAGES),
      projectValueBand: sanitizeEnum(body.projectValueBand, ALLOWED_PROJECT_VALUE_BANDS),
      urgency: sanitizeEnum(body.urgency, ALLOWED_URGENCY),
      message: sanitize(body.message, 5000),
      confidentialityRequired: sanitizeBoolean(body.confidentialityRequired),
      conflictCheckAcknowledged: sanitizeBoolean(body.conflictCheckAcknowledged),
      leadSource: sanitize(body.leadSource, 255),
      pageUrl: normalizePublicUrl(body.pageUrl) || "https://www.stratasaudi.com/contact",
      referrer: normalizePublicUrl(body.referrer),
      sessionId: sanitize(body.sessionId, 255),
      firstTouch: normalizeTouchpoint(body.firstTouch),
      latestTouch: normalizeTouchpoint(body.latestTouch),
      userAgent: sanitize(req.headers["user-agent"], 1000),
    };

    payload.leadScore = leadScore(payload);

    const errors = validate(payload);
    if (Object.keys(errors).length > 0) {
      json(res, 422, { ok: false, errors });
      return;
    }

      await sendLeadEmail(payload);

      const auxiliaryResults = await Promise.allSettled([
        sendWebhook(payload),
        sendHubSpot(payload),
        sendGa4MeasurementProtocolEvent(payload),
      ]);

      auxiliaryResults.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn("strata_contact_auxiliary_delivery_warning", {
            target: ["webhook", "hubspot", "ga4"][index],
            message: result.reason && result.reason.message ? result.reason.message : "Unknown error",
          });
        }
      });

      // Store lead score and mandate type in cookie for thank-you page to access
      const cookies = [
        buildClientCookie("strata_lead_score", payload.leadScore.toString()),
        buildClientCookie("strata_mandate_type", payload.mandateType),
        buildClientCookie("strata_counterparty_type", payload.counterpartyType),
      ];

      if (payload.confidentialityRequired) {
        cookies.push(
          buildClientCookie(
            "strata_confidentiality_required",
            payload.confidentialityRequired.toString(),
          ),
        );
      }

      res.setHeader("Set-Cookie", cookies);

     json(res, 200, {
       ok: true,
       leadScore: payload.leadScore,
       message: "Confidential enquiry received. Strata Saudi will review mandate fit and respond promptly.",
     });
  } catch (error) {
    if (error && error.retryAfterSeconds) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
    }
    const statusCode =
      error && Number.isInteger(error.statusCode) ? error.statusCode : 500;
    console.error("strata_contact_api_error", {
      message: error && error.message ? error.message : "Unknown error",
      statusCode,
    });
    json(res, statusCode, {
      ok: false,
      error:
        statusCode >= 500
          ? "We could not send your enquiry right now. Please email advisory@stratasaudi.com directly."
          : error.message,
    });
  }
};
