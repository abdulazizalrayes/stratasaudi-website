#!/usr/bin/env node

const { execFileSync } = require("child_process");
const https = require("https");
const path = require("path");

const { PAGE_SEO_ROUTES, SITE_ORIGIN } = require("../lib/page-renderer");
const { CONTENT_SIGNAL, markdownPublicPathForRoute } = require("../lib/markdown-layer");

const ROOT = path.join(__dirname, "..");

function run(command, args) {
  const started = Date.now();
  try {
    const output = execFileSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, command: [command, ...args].join(" "), ms: Date.now() - started, output: output.trim().slice(-4000) };
  } catch (error) {
    return {
      ok: false,
      command: [command, ...args].join(" "),
      ms: Date.now() - started,
      output: String(error.stdout || "").trim().slice(-4000),
      error: String(error.stderr || error.message || "").trim().slice(-4000),
    };
  }
}

function request(pathname, headers = {}) {
  return new Promise((resolve) => {
    const req = https.request(`${SITE_ORIGIN}${pathname}`, { headers }, (res) => {
      let bytes = 0;
      res.on("data", (chunk) => {
        bytes += chunk.length;
      });
      res.on("end", () => {
        resolve({ pathname, status: res.statusCode, headers: res.headers, bytes });
      });
    });
    req.on("error", (error) => resolve({ pathname, status: 0, headers: {}, bytes: 0, error: error.message }));
    req.end();
  });
}

async function auditLivePages() {
  const rows = [];
  for (const page of PAGE_SEO_ROUTES) {
    const route = page.path;
    const html = await request(route, { Accept: "text/html" });
    const markdown = await request(route, { Accept: "text/markdown" });
    const qZero = await request(route, { Accept: "text/markdown;q=0, text/html;q=1" });
    const sidecar = await request(markdownPublicPathForRoute(route));
    rows.push({
      route,
      html_ok: html.status === 200 && String(html.headers["content-type"]).includes("text/html"),
      markdown_ok:
        markdown.status === 200 &&
        String(markdown.headers["content-type"]).includes("text/markdown") &&
        markdown.headers["content-signal"] === CONTENT_SIGNAL,
      q0_fallback_ok: qZero.status === 200 && String(qZero.headers["content-type"]).includes("text/html"),
      sidecar_ok:
        sidecar.status === 200 &&
        String(sidecar.headers["content-type"]).includes("text/markdown") &&
        sidecar.headers["x-robots-tag"] === "noindex, follow",
      html_bytes: html.bytes,
      markdown_bytes: markdown.bytes,
    });
  }
  return rows;
}

async function auditDiscoveryEndpoints() {
  const endpoints = [
    "/robots.txt",
    "/llms.txt",
    "/llms-full.txt",
    "/openapi.json",
    "/auth.md",
    "/.well-known/agent-card.json",
    "/.well-known/api-catalog",
    "/.well-known/mcp.json",
    "/.well-known/mcp/server-card.json",
    "/.well-known/mcp/server-cards.json",
    "/.well-known/agent-skills/index.json",
    "/api/mcp",
    "/data/company.json",
    "/data/services.json",
    "/data/capabilities.json",
    "/data/service-areas.json",
    "/data/project-inquiry-schema.json",
    "/data/agent-routing.json",
    "/0957b4b1b950a90f9ac51a5a737203ec.txt",
  ];
  const rows = [];
  for (const endpoint of endpoints) {
    const response = await request(endpoint);
    rows.push({
      endpoint,
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      content_type: response.headers["content-type"] || "",
      bytes: response.bytes,
    });
  }
  return rows;
}

async function auditBingAndIndexNow() {
  const indexNowKey = await request("/0957b4b1b950a90f9ac51a5a737203ec.txt");
  const bingAuth = await request("/BingSiteAuth.xml");
  return {
    indexnow_key_ok:
      indexNowKey.status === 200 &&
      String(indexNowKey.headers["content-type"] || "").includes("text/plain") &&
      indexNowKey.bytes === 32,
    indexnow_key_status: indexNowKey.status,
    bing_site_auth_ok:
      bingAuth.status === 200 &&
      String(bingAuth.headers["content-type"] || "").includes("xml"),
    bing_site_auth_status: bingAuth.status,
    bing_site_auth_note:
      bingAuth.status === 404
        ? "BingSiteAuth.xml is implemented but production BING_SITE_AUTH_XML is not configured."
        : "",
  };
}

async function main() {
  const localChecks = [
    run("npm", ["run", "validate:markdown"]),
    run("npm", ["run", "validate:agent-readiness"]),
    run("npm", ["run", "validate:seo"]),
    run("npm", ["run", "validate:domain"]),
  ];
  const pages = await auditLivePages();
  const discovery = await auditDiscoveryEndpoints();
  const bingIndexNow = await auditBingAndIndexNow();
  const htmlBytes = pages.reduce((sum, row) => sum + row.html_bytes, 0);
  const markdownBytes = pages.reduce((sum, row) => sum + row.markdown_bytes, 0);
  const notes = [
    "Search Console status still requires UI/API review because Google processing is asynchronous.",
    "Direct Markdown sidecars should remain noindex, follow; canonical HTML remains the indexable surface.",
  ];
  if (!bingIndexNow.bing_site_auth_ok) {
    notes.push("BingSiteAuth.xml requires the exact Bing-provided XML value in Vercel as BING_SITE_AUTH_XML before it can return 200.");
  }
  const failures = [
    ...localChecks.filter((check) => !check.ok).map((check) => `local check failed: ${check.command}`),
    ...pages
      .filter((row) => !row.html_ok || !row.markdown_ok || !row.q0_fallback_ok || !row.sidecar_ok)
      .map((row) => `page check failed: ${row.route}`),
    ...discovery.filter((row) => !row.ok).map((row) => `discovery endpoint failed: ${row.endpoint}`),
  ];

  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        generated_at: new Date().toISOString(),
        company: "Strata Risk Advisory",
        canonical_origin: SITE_ORIGIN,
        content_signal: CONTENT_SIGNAL,
        local_checks: localChecks,
        canonical_pages_checked: pages.length,
        discovery_endpoints_checked: discovery.length,
        bing_indexnow: bingIndexNow,
        response_size_reduction_percent: Number(((1 - markdownBytes / htmlBytes) * 100).toFixed(1)),
        failures,
        pages,
        discovery,
        notes,
      },
      null,
      2,
    ),
  );

  if (failures.length) process.exit(1);
}

main();
