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

async function callPage(url, accept, method = "GET") {
  const harness = responseHarness();
  const headers = {};
  if (accept !== undefined) headers.accept = accept;
  await pageHandler({ url, method, headers }, harness.res);
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
    assert(!markdown.match(/^canonical: .*\.html/m), `${page.path}: .html canonical regression`);
    assert(markdown.includes('language: "en"'), `${page.path}: language metadata missing`);
    assert(markdown.includes(`content_signal: "${CONTENT_SIGNAL}"`), `${page.path}: Content-Signal metadata missing`);
    assert(markdown.includes("generated_from_sitemap: true"), `${page.path}: sitemap provenance missing`);
    assert(markdown.includes("approval_required_before_contact: true"), `${page.path}: approval metadata missing`);
    assert(markdown.includes("not_a_law_firm: true"), `${page.path}: legal-boundary metadata missing`);
    assert(markdown.includes("## Agent Summary"), `${page.path}: agent summary missing`);
    assert(markdown.includes("## Agent Use Contract"), `${page.path}: agent use contract missing`);
    assert(markdown.includes("## Structured Resources For Agents"), `${page.path}: structured resource links missing`);
    assert(markdown.includes("## Source Provenance"), `${page.path}: source provenance missing`);
    assert(markdown.includes("must not submit forms"), `${page.path}: no-submission rule missing`);
    assert(markdown.includes("https://www.stratasaudi.com/data/agent-routing.json"), `${page.path}: agent routing resource missing`);
    assert(markdown.includes("## Public JSON-LD Structured Data"), `${page.path}: public JSON-LD block missing`);
    assert(!markdown.includes("First Name"), `${page.path}: form field leaked into Markdown`);
    assert(!markdown.includes("Last Name"), `${page.path}: form field leaked into Markdown`);
    assert(!markdown.includes("+966XXXXXXXXX"), `${page.path}: phone placeholder leaked into Markdown`);
    assert(!markdown.includes("Email advisory@stratasaudi.com"), `${page.path}: contact bar leaked into Markdown`);
    assert(!markdown.includes("Home /"), `${page.path}: breadcrumb chrome leaked into Markdown`);
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
  assert.strictEqual(wantsMarkdown({ headers: { accept: "text/html;q=0.8,text/markdown;q=0.8" } }), false);
  assert.strictEqual(wantsMarkdown({ headers: { accept: "text/html;q=0,text/*;q=0.8" } }), true);
  assert.strictEqual(wantsMarkdown({ headers: { accept: "text/*" } }), false);
  assert.strictEqual(wantsMarkdown({ headers: { accept: "*/*" } }), false);
  assert.strictEqual(wantsMarkdown({ headers: { accept: "text/markdown;q=0,*/*;q=1" } }), false);
  assert.strictEqual(wantsMarkdown({ headers: { accept: "text/markdown;q=invalid,text/html;q=0.5" } }), false);
  assert.strictEqual(wantsMarkdown({ headers: {} }), false);
}

async function validateWorkerBehavior() {
  const alternateLink = `<${SITE_ORIGIN}/services.md>; rel="alternate"; type="text/markdown"`;
  const markdown = await callPage("/services", "text/markdown");
  assert.strictEqual(markdown.headers["content-type"], "text/markdown; charset=utf-8");
  assert.strictEqual(markdown.headers.vary, "Accept");
  assert.strictEqual(markdown.headers["content-language"], "en");
  assert.strictEqual(markdown.headers["content-signal"], CONTENT_SIGNAL);
  assert.strictEqual(markdown.headers["x-content-type-options"], "nosniff");
  assert.strictEqual(markdown.headers["x-frame-options"], "DENY");
  assert(markdown.headers["content-security-policy"].includes("frame-ancestors 'none'"));
  assert(markdown.headers["cache-control"].includes("s-maxage=3600"));
  assert.strictEqual(markdown.headers["content-location"], `${SITE_ORIGIN}/services.md`);
  assert.strictEqual(markdown.headers.link, `<${SITE_ORIGIN}/services>; rel="canonical"`);
  assert(markdown.body.startsWith("---\n"), "negotiated Markdown body should use generated sidecar");

  const html = await callPage("/services", "text/html");
  assert.strictEqual(html.headers["content-type"], "text/html; charset=utf-8");
  assert.strictEqual(html.headers.vary, "Accept");
  assert.strictEqual(html.headers["content-language"], "en");
  assert.strictEqual(html.headers["content-signal"], CONTENT_SIGNAL);
  assert.strictEqual(html.headers.link, alternateLink);
  assert.strictEqual(html.headers["x-frame-options"], "DENY");
  assert.strictEqual(html.headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert(html.headers["cache-control"].includes("stale-while-revalidate=86400"));
  assert.strictEqual(html.body, readHtmlForPath("/services"), "explicit HTML body must remain byte-identical");

  const strongerHtml = await callPage("/services", "text/html;q=0.9,text/markdown;q=0.4");
  assert.strictEqual(strongerHtml.headers["content-type"], "text/html; charset=utf-8");

  const strongerMarkdown = await callPage("/services", "text/html;q=0.4,text/markdown;q=0.9");
  assert.strictEqual(strongerMarkdown.headers["content-type"], "text/markdown; charset=utf-8");

  const equalExplicit = await callPage("/services", "text/html;q=0.8,text/markdown;q=0.8");
  assert.strictEqual(equalExplicit.headers["content-type"], "text/html; charset=utf-8");

  const qZero = await callPage("/services", "text/markdown;q=0,text/html;q=1");
  assert.strictEqual(qZero.headers["content-type"], "text/html; charset=utf-8");
  assert(qZero.body.includes("<!DOCTYPE html>") || qZero.body.includes("<html"), "q=0 response should fall back to HTML");

  const wildcardMarkdown = await callPage("/services", "text/html;q=0,text/*;q=0.8");
  assert.strictEqual(wildcardMarkdown.headers["content-type"], "text/markdown; charset=utf-8");

  const textWildcard = await callPage("/services", "text/*");
  assert.strictEqual(textWildcard.headers["content-type"], "text/html; charset=utf-8");

  const allWildcard = await callPage("/services", "*/*");
  assert.strictEqual(allWildcard.headers["content-type"], "text/html; charset=utf-8");

  const missingAccept = await callPage("/services", undefined);
  assert.strictEqual(missingAccept.headers["content-type"], "text/html; charset=utf-8");

  const invalidQuality = await callPage("/services", "text/markdown;q=invalid,text/html;q=0.5");
  assert.strictEqual(invalidQuality.headers["content-type"], "text/html; charset=utf-8");

  const direct = await callPage("/services.md", "text/html");
  assert.strictEqual(direct.headers["content-type"], "text/markdown; charset=utf-8");
  assert.strictEqual(direct.headers["x-robots-tag"], "noindex, follow");
  assert.strictEqual(direct.headers["content-location"], `${SITE_ORIGIN}/services.md`);
  assert.strictEqual(direct.headers["content-signal"], CONTENT_SIGNAL);

  const htmlHead = await callPage("/services", "text/html", "HEAD");
  assert.strictEqual(htmlHead.body, "");
  assert.strictEqual(htmlHead.headers.link, alternateLink);
  assert.strictEqual(htmlHead.headers.vary, "Accept");
  assert.strictEqual(htmlHead.headers["content-signal"], CONTENT_SIGNAL);

  const markdownHead = await callPage("/services", "text/markdown", "HEAD");
  assert.strictEqual(markdownHead.body, "");
  assert.strictEqual(markdownHead.headers["content-type"], "text/markdown; charset=utf-8");
  assert.strictEqual(markdownHead.headers.link, `<${SITE_ORIGIN}/services>; rel="canonical"`);

  const sidecarHead = await callPage("/services.md", "text/html", "HEAD");
  assert.strictEqual(sidecarHead.body, "");
  assert.strictEqual(sidecarHead.headers["x-robots-tag"], "noindex, follow");

  const nonIndexable = await callPage("/thank-you", "text/markdown");
  assert.strictEqual(nonIndexable.headers["content-type"], "text/html; charset=utf-8");

  for (const language of SUPPORTED_LANGUAGES) {
    const languageQuery = await callPage(`/services?lang=${language.code}`, "text/markdown");
    assert.strictEqual(languageQuery.headers["content-type"], "text/html; charset=utf-8");
    assert.strictEqual(languageQuery.headers["content-language"], language.code);
    assert.strictEqual(languageQuery.headers["x-robots-tag"], "noindex, follow");
    assert(
      languageQuery.body.includes(`lang="${language.code}"`),
      `${language.code}: language query should preserve HTML language rendering`,
    );
  }

  const invalidLanguageQuery = await callPage("/services?lang=invalid", "text/html");
  assert.strictEqual(invalidLanguageQuery.headers["x-robots-tag"], "noindex, follow");
  assert.strictEqual(invalidLanguageQuery.headers["content-language"], "en");

  const trackingQuery = await callPage("/services?utm_source=agent", "text/markdown");
  assert.strictEqual(trackingQuery.headers["content-type"], "text/markdown; charset=utf-8");

  for (const page of PAGE_SEO_ROUTES) {
    const slug = page.path === "/" ? "index" : page.path.slice(1);
    const expectedAlternate = `<${SITE_ORIGIN}/${slug}.md>; rel="alternate"; type="text/markdown"`;
    const pageHtml = await callPage(page.path, "text/html");
    const pageHead = await callPage(page.path, "text/html", "HEAD");
    assert(pageHtml.headers.link.includes(expectedAlternate), `${page.path}: HTML alternate Link missing`);
    assert(pageHead.headers.link.includes(expectedAlternate), `${page.path}: HEAD alternate Link missing`);
    assert.strictEqual(pageHtml.body, readHtmlForPath(page.path), `${page.path}: HTML response body changed`);
    assert.strictEqual(pageHead.body, "", `${page.path}: HEAD response returned a body`);
  }

  const contactHtml = await callPage("/contact", "text/html");
  assert(contactHtml.body.includes('<form id="contactForm" method="post" action="/api/contact">'), "contact form changed");
  assert(contactHtml.body.includes('<script src="/assets/strata-analytics.js" defer></script>'), "analytics loader changed");
  assert(contactHtml.body.includes('<script src="/assets/site.js" defer></script>'), "site behavior loader changed");
}

function validateHtmlHashBaseline() {
  const baselinePath = path.join(ROOT, "tests", "fixtures", "html-response-baseline.json");
  assert(fs.existsSync(baselinePath), "mandatory HTML response baseline is missing");
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  for (const page of PAGE_SEO_ROUTES) {
    assert(baseline.routes[page.path], `${page.path}: HTML baseline entry missing`);
    const html = readHtmlForPath(page.path);
    assert.strictEqual(sha256(html), baseline.routes[page.path].sha256, `${page.path}: HTML hash changed`);
    assert.strictEqual(Buffer.byteLength(html), baseline.routes[page.path].bytes, `${page.path}: HTML byte size changed`);
  }
  return { routes: PAGE_SEO_ROUTES.length };
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
  assert.deepStrictEqual(vercel.regions, ["bom1"], "vercel.json: Saudi-near runtime region must be Mumbai");
  assert(JSON.stringify(vercel).includes("public-resource.js?resource=$1"), "vercel.json: observable public-resource route missing");

  const robots = read("robots.txt");
  for (const nonstandardDirective of ["LLMs:", "LLMs-Full:", "Agent-Card:", "MCP:", "OpenAPI:"]) {
    assert(!robots.includes(nonstandardDirective), `robots.txt: nonstandard ${nonstandardDirective} directive remains`);
  }
  for (const trainingBot of ["GPTBot", "Google-Extended", "CCBot", "anthropic-ai", "Bytespider", "ClaudeBot"]) {
    assert(
      robots.includes(`User-agent: ${trainingBot}\nDisallow: /`),
      `robots.txt: ${trainingBot} must be excluded from training/bulk-corpus crawling`,
    );
  }
  for (const retrievalBot of ["OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot"]) {
    assert(
      robots.includes(`User-agent: ${retrievalBot}\nAllow: /`),
      `robots.txt: ${retrievalBot} must remain available for search or user-initiated retrieval`,
    );
  }
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
    htmlHashBaseline: `${hashCheck.routes} routes unchanged`,
    acceptCasesChecked: 11,
    headAndAlternateLinksChecked: PAGE_SEO_ROUTES.length,
    contentSignal: CONTENT_SIGNAL,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
