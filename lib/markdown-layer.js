const fs = require("fs");
const path = require("path");

const { PAGE_SEO_ROUTES, SITE_ORIGIN, canonicalPathForRoute, normalizePath } = require("./page-renderer");

const ROOT = path.join(__dirname, "..");
const MARKDOWN_DIR = path.join(ROOT, "markdown");
const CONTENT_SIGNAL = "ai-train=no, search=yes, ai-input=yes";

function routeKey(inputPath) {
  const route = normalizePath(inputPath);
  const canonical = canonicalPathForRoute(route);
  return canonical || route;
}

function markdownSlugForRoute(inputPath) {
  const route = routeKey(inputPath);
  return route === "/" ? "index" : route.replace(/^\//, "");
}

function markdownPublicPathForRoute(inputPath) {
  return `/${markdownSlugForRoute(inputPath)}.md`;
}

function markdownFilePathForRoute(inputPath) {
  return path.join(MARKDOWN_DIR, `${markdownSlugForRoute(inputPath)}.md`);
}

function canonicalPathForMarkdownPath(inputPath) {
  const route = normalizePath(inputPath);
  if (route === "/index.md") return "/";
  if (!route.endsWith(".md")) return null;
  const candidate = `/${route.replace(/^\//, "").replace(/\.md$/, "")}`;
  return PAGE_SEO_ROUTES.some((page) => page.path === candidate) ? candidate : null;
}

function readMarkdownForRoute(inputPath) {
  const filePath = markdownFilePathForRoute(inputPath);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function parseAcceptHeader(headerValue) {
  return String(headerValue || "")
    .split(",")
    .map((part, index) => {
      const [rawType, ...params] = part.trim().split(";").map((value) => value.trim());
      if (!rawType) return null;
      const qParam = params.find((param) => param.toLowerCase().startsWith("q="));
      const parsedQ = qParam ? Number(qParam.slice(2)) : 1;
      const q = Number.isFinite(parsedQ) ? Math.max(0, Math.min(1, parsedQ)) : 1;
      return { type: rawType.toLowerCase(), q, index };
    })
    .filter(Boolean)
    .sort((left, right) => right.q - left.q || left.index - right.index);
}

function wantsMarkdown(req) {
  const accepted = parseAcceptHeader(req && req.headers ? req.headers.accept : "");
  const markdown = accepted.find((item) => item.type === "text/markdown");
  if (!markdown || markdown.q === 0) return false;
  const html = accepted.find((item) => item.type === "text/html" || item.type === "application/xhtml+xml");
  return !html || markdown.q >= html.q;
}

function setMarkdownHeaders(res, canonicalPath, options = {}) {
  const canonicalUrl = `${SITE_ORIGIN}${canonicalPath === "/" ? "/" : canonicalPath}`;
  const contentLocation = `${SITE_ORIGIN}${markdownPublicPathForRoute(canonicalPath)}`;
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Vary", "Accept");
  res.setHeader("Content-Location", contentLocation);
  res.setHeader("Content-Language", "en");
  res.setHeader("Content-Signal", CONTENT_SIGNAL);
  res.setHeader("Link", `<${canonicalUrl}>; rel="canonical"`);
  if (options.directSidecar) {
    res.setHeader("X-Robots-Tag", "noindex, follow");
  }
}

module.exports = {
  CONTENT_SIGNAL,
  MARKDOWN_DIR,
  canonicalPathForMarkdownPath,
  markdownFilePathForRoute,
  markdownPublicPathForRoute,
  parseAcceptHeader,
  readMarkdownForRoute,
  setMarkdownHeaders,
  wantsMarkdown,
};
