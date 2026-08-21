const fs = require("fs");
const path = require("path");

const {
  PAGE_SEO_ROUTES,
  SITE_ORIGIN,
  canonicalPathForRoute,
  languageFromPath,
  normalizePath,
  publicUrlForRoute,
} = require("./page-renderer");
const { setSecurityHeaders } = require("./security-headers");

const ROOT = path.join(__dirname, "..");
const MARKDOWN_DIR = path.join(ROOT, "markdown");
const CONTENT_SIGNAL = "ai-train=no, search=yes, ai-input=yes";

function routeKey(inputPath) {
  const route = normalizePath(inputPath);
  const canonical = canonicalPathForRoute(route);
  return canonical || route;
}

function markdownSlugForRoute(inputPath, languageCode = languageFromPath(inputPath)) {
  const route = routeKey(inputPath);
  const slug = route === "/" ? "index" : route.replace(/^\//, "");
  return languageCode === "en" ? slug : `${languageCode}/${slug}`;
}

function markdownPublicPathForRoute(inputPath, languageCode = languageFromPath(inputPath)) {
  return `/${markdownSlugForRoute(inputPath, languageCode)}.md`;
}

function markdownFilePathForRoute(inputPath, languageCode = languageFromPath(inputPath)) {
  return path.join(MARKDOWN_DIR, `${markdownSlugForRoute(inputPath, languageCode)}.md`);
}

function canonicalPathForMarkdownPath(inputPath) {
  const route = normalizePath(inputPath);
  if (route === "/index.md") return "/";
  if (!route.endsWith(".md")) return null;
  let candidate = canonicalPathForRoute(`/${route.replace(/^\//, "").replace(/\.md$/, "")}`);
  if (candidate === "/index") candidate = "/";
  return PAGE_SEO_ROUTES.some((page) => page.path === candidate) ? candidate : null;
}

function readMarkdownForRoute(inputPath, languageCode = languageFromPath(inputPath)) {
  const filePath = markdownFilePathForRoute(inputPath, languageCode);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function qualityValue(params) {
  const qParam = params.find((param) => param.toLowerCase().startsWith("q="));
  if (!qParam) return 1;
  const raw = qParam.slice(2).trim();
  if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(raw)) return 0;
  return Number(raw);
}

function mediaRangeSpecificity(type) {
  if (type === "*/*") return 0;
  if (type.endsWith("/*")) return 1;
  return 2;
}

function parseAcceptHeader(headerValue) {
  return String(headerValue || "")
    .split(",")
    .map((part, index) => {
      const [rawType, ...params] = part.trim().split(";").map((value) => value.trim());
      const type = String(rawType || "").toLowerCase();
      if (!type.includes("/")) return null;
      return {
        type,
        q: qualityValue(params),
        specificity: mediaRangeSpecificity(type),
        index,
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      right.q - left.q ||
      right.specificity - left.specificity ||
      left.index - right.index,
    );
}

function rangeMatchesRepresentation(range, representation) {
  if (range.type === representation || range.type === "*/*") return true;
  const [rangeType, rangeSubtype] = range.type.split("/");
  const [representationType] = representation.split("/");
  return rangeSubtype === "*" && rangeType === representationType;
}

function representationPreference(accepted, representation) {
  const matches = accepted
    .filter((range) => rangeMatchesRepresentation(range, representation))
    .sort((left, right) =>
      right.specificity - left.specificity ||
      right.q - left.q ||
      left.index - right.index,
    );
  return matches[0] || null;
}

function wantsMarkdown(req) {
  const accepted = parseAcceptHeader(req && req.headers ? req.headers.accept : "");
  if (!accepted.length) return false;

  const markdown = representationPreference(accepted, "text/markdown");
  const html = representationPreference(accepted, "text/html");

  if (!markdown || markdown.q === 0) return false;
  if (!html || html.q === 0) return true;
  if (markdown.q !== html.q) return markdown.q > html.q;
  if (markdown.specificity !== html.specificity) {
    return markdown.specificity > html.specificity;
  }
  return false;
}

function setMarkdownHeaders(res, canonicalPath, options = {}) {
  const languageCode = options.language || "en";
  const canonicalUrl = publicUrlForRoute(canonicalPath, languageCode);
  const contentLocation = `${SITE_ORIGIN}${markdownPublicPathForRoute(canonicalPath, languageCode)}`;
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Vary", "Accept");
  res.setHeader("Content-Location", contentLocation);
  res.setHeader("Content-Language", languageCode);
  res.setHeader("Content-Signal", CONTENT_SIGNAL);
  res.setHeader("Link", `<${canonicalUrl}>; rel="canonical"`);
  setSecurityHeaders(res);
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
