#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  PAGE_SEO_ROUTES,
  SITE_ORIGIN,
  SUPPORTED_LANGUAGES,
  readHtmlForPath,
} = require("../lib/page-renderer");
const {
  CONTENT_SIGNAL,
  canonicalPathForMarkdownPath,
  markdownFilePathForRoute,
  parseAcceptHeader,
  wantsMarkdown,
} = require("../lib/markdown-layer");
const pageHandler = require("../api/page");

const ROOT = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function responseHarness() {
  const headers = {};
  let body = "";
  return {
    res: {
      statusCode: 200,
      setHeader(key, value) {
        headers[key.toLowerCase()] = value;
      },
      end(value = "") {
        body += String(value);
      },
    },
    headers,
    get body() {
      return body;
    },
  };
}

async function callPage(url, accept) {
  const harness = responseHarness();
  await pageHandler({ url, headers: { accept } }, harness.res);
  return { statusCode: harness.res.statusCode, headers: harness.headers, body: harness.body };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sitemapPaths() {
  const sitemap = read("sitemap.xml");
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1]).pathname || "/")
    .map((pathname) => (pathname === "" ? "/" : pathname));
}

function validateJsonAndMetadata() {
  const jsonFiles = [
    "data/company.json",
    "data/services.json",
    "data/capabilities.json",
    "data/service-areas.json",
    "data/project-inquiry-schema.json",
    "data/agent-routing.json",
    "openapi.json",
    ".well-known/agent-card.json",
    ".well-known/mcp.json",
    ".well-known/mcp/server-card.json",
    ".well-known/mcp/server-cards.json",
    ".well-known/agent-skills/index.json",
  ];
  jsonFiles.forEach(json);

  for (const page of PAGE_SEO_ROUTES) {
    const markdown = fs.readFileSync(markdownFilePathForRoute(page.path), "utf8");
    assert(markdown.includes(`canonical: "${SITE_ORIGIN}${page.path === "/" ? "/" : page.path}"`), `${page.path}: canonical metadata missing`);
    assert(markdown.includes('language: "en"'), `${page.path}: language metadata missing`);
    assert(markdown.includes(`content_signal: "${CONTENT_SIGNAL}"`), `${page.path}: Content-Signal metadata missing`);
    assert(markdown.includes("## Agent Summary"), `${page.path}: agent summary missing`);
    assert(markdown.includes("## Public JSON-LD Structured Data"), `${page.path}: public JSON-LD block missing`);
    assert(!markdown.includes("First Name"), `${page.path}: form field leaked into Markdown`);
    assert(!markdown.includes("Last Name"), `${page.path}: form field leaked into Markdown`);
    assert(!markdown.includes("+966XXXXXXXXX"), `${page.path}: phone placeholder leaked into Markdown`);
  }
}

function validateSitemapCoverage() {
  const fromSitemap = sitemapPaths();
  const fromRoutes = PAGE_SEO_ROUTES.map((page) => page.path);
  assert.deepStrictEqual(fromSitemap, fromRoutes, "sitemap routes must match PAGE_SEO_ROUTES order and coverage");
  for (const page of PAGE_SEO_ROUTES) {
    assert(fs.existsSync(markdownFilePathForRoute(page.path)), `${page.path}: Markdown sidecar missing`);
  }
  assert.strictEqual(canonicalPathForMarkdownPath("/index.md"), "/");
  assert.strictEqual(canonicalPathForMarkdownPath("/services.md"), "/services");
  assert.strictEqual(canonicalPathForMarkdownPath("/thank-you.md"), null);
}

function validateAcceptParsing() {
  assert.strictEqual(parseAcceptHeader("text/markdown;q=0,text/html;q=1")[0].type, "text/html");
  assert.strictEqual(wantsMarkdown({ headers: { accept: "text/markdown;q=0,text/html;q=1" } }), false);
  assert.strictEqual(wantsMarkdown({ headers: { accept: "text/html;q=0.1,text/markdown;q=0.9" } }), true);
  assert.strictEqual(wantsMarkdown({ headers: { accept: "text/html, text/markdown;q=0.5" } }), false);
}

async function validateWorkerBehavior() {
  const markdown = await callPage("/services", "text/markdown");
  assert.strictEqual(markdown.headers["content-type"], "text/markdown; charset=utf-8");
  assert.strictEqual(markdown.headers.vary, "Accept");
  assert.strictEqual(markdown.headers["content-language"], "en");
  assert.strictEqual(markdown.headers["content-signal"], CONTENT_SIGNAL);
  assert.strictEqual(markdown.headers["content-location"], `${SITE_ORIGIN}/services.md`);
  assert.strictEqual(markdown.headers.link, `<${SITE_ORIGIN}/services>; rel="canonical"`);
  assert(markdown.body.startsWith("---\n"), "negotiated Markdown body should use generated sidecar");

  const qZero = await callPage("/services", "text/markdown;q=0,text/html;q=1");
  assert.strictEqual(qZero.headers["content-type"], "text/html; charset=utf-8");
  assert(qZero.body.includes("<!DOCTYPE html>") || qZero.body.includes("<html"), "q=0 response should fall back to HTML");

  const direct = await callPage("/services.md", "text/html");
  assert.strictEqual(direct.headers["content-type"], "text/markdown; charset=utf-8");
  assert.strictEqual(direct.headers["x-robots-tag"], "noindex, follow");
  assert.strictEqual(direct.headers["content-location"], `${SITE_ORIGIN}/services.md`);

  const nonIndexable = await callPage("/thank-you", "text/markdown");
  assert.strictEqual(nonIndexable.headers["content-type"], "text/html; charset=utf-8");

  const languageQuery = await callPage("/services?lang=ar", "text/markdown");
  assert.strictEqual(languageQuery.headers["content-type"], "text/html; charset=utf-8");
  assert(languageQuery.body.includes('lang="ar"'), "language query should preserve HTML language rendering");
}

function validateHtmlHashBaseline() {
  const baselinePath = path.join(ROOT, "tmp", "html-hashes-before-markdown.json");
  if (!fs.existsSync(baselinePath)) return { skipped: true };
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  for (const page of PAGE_SEO_ROUTES) {
    const html = readHtmlForPath(page.path);
    assert.strictEqual(sha256(html), baseline.routes[page.path].sha256, `${page.path}: HTML hash changed`);
    assert.strictEqual(Buffer.byteLength(html), baseline.routes[page.path].bytes, `${page.path}: HTML byte size changed`);
  }
  return { skipped: false, routes: PAGE_SEO_ROUTES.length };
}

function validateDiscoveryDocs() {
  const llms = read("llms.txt");
  const full = read("llms-full.txt");
  const vercel = json("vercel.json");
  const openapi = json("openapi.json");

  assert(llms.includes("Accept: text/markdown"), "llms.txt: Markdown negotiation instructions missing");
  assert(full.includes("/services.md"), "llms-full.txt: direct Markdown sidecar guidance missing");
  assert(JSON.stringify(openapi).includes("text/markdown"), "openapi.json: Markdown media type missing");
  assert(JSON.stringify(vercel).includes("markdown/**/*.md"), "vercel.json: Markdown includeFiles missing");
  assert(JSON.stringify(vercel).includes("/(.+)\\\\.md"), "vercel.json: direct .md route missing");
}

async function main() {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "generate-markdown-companions.js"), "--check"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  validateJsonAndMetadata();
  validateSitemapCoverage();
  validateAcceptParsing();
  await validateWorkerBehavior();
  const hashCheck = validateHtmlHashBaseline();
  validateDiscoveryDocs();

  console.log(JSON.stringify({
    ok: true,
    pages: PAGE_SEO_ROUTES.length,
    markdownFiles: PAGE_SEO_ROUTES.length,
    languagesChecked: SUPPORTED_LANGUAGES.map((language) => language.code),
    htmlHashBaseline: hashCheck.skipped ? "skipped" : `${hashCheck.routes} routes unchanged`,
    contentSignal: CONTENT_SIGNAL,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
