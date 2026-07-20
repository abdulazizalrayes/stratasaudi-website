#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { getPaperclipBaseUrl } = require("./lib/paperclip-base-url");
const { requestViaChromeSession } = require("./lib/paperclip-chrome-session");

const BASE_URL = getPaperclipBaseUrl();
const ROOT = process.env.STRATA_WORKSPACE_CWD || path.join(__dirname, "..");
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "295d8dfc-a689-4a3c-a4f2-a1cca4997d8a";
const COOKIE_HEADER = process.env.PAPERCLIP_COOKIE_HEADER || "";
const BEARER_TOKEN = process.env.PAPERCLIP_BEARER_TOKEN || "";
const USE_CHROME_SESSION =
  process.env.PAPERCLIP_USE_CHROME_SESSION === "true";
const CHROME_URL_MATCH =
  process.env.PAPERCLIP_CHROME_URL_MATCH || `${BASE_URL}/HAD/`;

const manifestPath =
  process.env.QWEN_MANIFEST_PATH ||
  path.join(ROOT, "paperclip", "reports", "qwen3-pilot", "qwen3-pilot-manifest.json");

const dryRun =
  process.argv.includes("--dry-run") ||
  process.env.PAPERCLIP_DRY_RUN === "true";

const applyChanges =
  process.argv.includes("--apply");

async function requestJson(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (USE_CHROME_SESSION) {
    const chromeResponse = requestViaChromeSession({
      method: options.method || "GET",
      url,
      headers,
      body: options.body || null,
      urlMatch: CHROME_URL_MATCH,
    });
    const text = chromeResponse.text || "";
    if (text && text.trim().startsWith("<!DOCTYPE")) {
      const error = new Error(
        "Paperclip returned HTML instead of JSON from the Chrome session."
      );
      error.body = {
        preview: text.slice(0, 120),
      };
      throw error;
    }
    const body = text ? JSON.parse(text) : null;
    if (chromeResponse.status < 200 || chromeResponse.status >= 300) {
      const error = new Error(
        `${chromeResponse.status} ${chromeResponse.statusText}`
      );
      error.body = body;
      throw error;
    }
    return body;
  }

  if (COOKIE_HEADER) {
    headers.Cookie = COOKIE_HEADER;
  }

  if (BEARER_TOKEN) {
    headers.Authorization = `Bearer ${BEARER_TOKEN}`;
  }

  const response = await fetch(url, {
    headers,
    ...options,
  });
  const text = await response.text();
  if (text && text.trim().startsWith("<!DOCTYPE")) {
    const error = new Error(
      "Paperclip returned HTML instead of JSON. The API call is likely behind Cloudflare Access and needs an authenticated cookie or token."
    );
    error.body = {
      hint:
        "Set PAPERCLIP_COOKIE_HEADER or PAPERCLIP_BEARER_TOKEN before running this script.",
      preview: text.slice(0, 120),
    };
    throw error;
  }
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}`);
    error.body = body;
    throw error;
  }
  return body;
}

function buildPlaceholderHttpAdapter(manifest) {
  return {
    adapterType: "http",
    adapterConfig: {
      protocol: "openai-compatible",
      baseUrl: manifest.qwenEndpoint.baseUrl,
      model: manifest.qwenEndpoint.model,
      timeoutSec: 120,
      authMode: "bearer",
      apiKeyEnvVar:
        manifest.qwenEndpoint.apiKeyEnvVar || "QWEN_VLLM_API_KEY",
      note: "Placeholder field map. Confirm live Paperclip HTTP adapter schema before applying in production.",
    },
  };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const liveAgents = await requestJson(`${BASE_URL}/api/companies/${COMPANY_ID}/agents`);
  const byName = new Map(liveAgents.map((agent) => [agent.name, agent]));

  const results = [];

  for (const pilot of manifest.pilotAgents) {
    const live = byName.get(pilot.name);
    if (!live) {
      results.push({ name: pilot.name, status: "missing_live_agent" });
      continue;
    }

    const adapter = buildPlaceholderHttpAdapter(manifest);
    const payload = {
      adapterType: adapter.adapterType,
      adapterConfig: adapter.adapterConfig,
      runtimeConfig: {
        ...(live.runtimeConfig || {}),
        heartbeat: {
          ...((live.runtimeConfig && live.runtimeConfig.heartbeat) || {}),
          wakeOnDemand: true,
          intervalSec: 0,
          maxConcurrentRuns: 1,
        },
      },
      metadata: {
        ...(live.metadata || {}),
        qwenPilotCandidate: true,
        qwenPilotPreparedAt: new Date().toISOString(),
      },
    };

    if (!applyChanges) {
      results.push({
        name: pilot.name,
        status: "prepared_only",
        liveAgentId: live.id,
        payload,
      });
      continue;
    }

    await requestJson(`${BASE_URL}/api/agents/${live.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    results.push({
      name: pilot.name,
      status: "patched",
      liveAgentId: live.id,
    });
  }

    console.log(JSON.stringify({
    ok: true,
    dryRun,
    applyChanges,
    manifestPath,
    useChromeSession: USE_CHROME_SESSION,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    body: error.body || null,
  }, null, 2));
  process.exit(1);
});
