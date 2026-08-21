const {
  PAGE_SEO_ROUTES,
  SITE_ORIGIN,
  canonicalPathForRoute,
  languageFromPath,
  normalizePath,
  publicPathForRoute,
  readHtmlForPath,
} = require("../lib/page-renderer");
const {
  CONTENT_SIGNAL,
  canonicalPathForMarkdownPath,
  markdownPublicPathForRoute,
  readMarkdownForRoute,
  setMarkdownHeaders,
  wantsMarkdown,
} = require("../lib/markdown-layer");
const { classifyUserAgent, recordAgentEvent } = require("../lib/agent-observability");
const { setSecurityHeaders } = require("../lib/security-headers");

const ROOT_SERVICE_LINKS = [
  '</.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/json"',
  '</robots.txt>; rel="service-doc"; type="text/plain"',
  '</sitemap.xml>; rel="service-doc"; type="application/xml"',
  '</api/client-config.js>; rel="service-desc"; type="application/javascript"',
];

function isHeadRequest(req) {
  return String(req && req.method || "GET").toUpperCase() === "HEAD";
}

function endRepresentation(req, res, body) {
  res.end(isHeadRequest(req) ? "" : body);
}

function isIndexableCanonicalPath(canonicalPath) {
  return PAGE_SEO_ROUTES.some((page) => page.path === canonicalPath);
}

function markdownAlternateLink(canonicalPath, languageCode) {
  const markdownUrl = `${SITE_ORIGIN}${markdownPublicPathForRoute(canonicalPath, languageCode)}`;
  return `<${markdownUrl}>; rel="alternate"; type="text/markdown"`;
}

function setCanonicalHtmlHeaders(res, canonicalPath, languageCode) {
  const links = [
    markdownAlternateLink(canonicalPath, languageCode),
    '</.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/json"',
  ];
  if (canonicalPath === "/" && languageCode === "en") links.push(...ROOT_SERVICE_LINKS.slice(1));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Vary", "Accept");
  res.setHeader("Content-Language", languageCode);
  res.setHeader("Content-Signal", CONTENT_SIGNAL);
  res.setHeader("Link", links.join(", "));
  setSecurityHeaders(res);
}

function hasLanguageQuery(inputPath) {
  try {
    return new URL(String(inputPath || "/"), SITE_ORIGIN).searchParams.has("lang");
  } catch (_error) {
    return false;
  }
}

function redirectLegacyHtml(req, res, requestedPath) {
  const route = normalizePath(requestedPath);
  if (route === "/" || !route.endsWith(".html")) return false;

  const canonicalPath = canonicalPathForRoute(requestedPath);
  if (!canonicalPath) return false;

  const url = new URL(requestedPath, SITE_ORIGIN);
  url.pathname = publicPathForRoute(canonicalPath, languageFromPath(requestedPath));
  res.statusCode = 308;
  setSecurityHeaders(res, { cacheControl: "public, max-age=0, s-maxage=86400" });
  res.setHeader("Location", `${url.pathname}${url.search}`);
  res.end();
  return true;
}

function redirectLegacyLanguageQuery(req, res, requestedPath) {
  let url;
  try {
    url = new URL(String(requestedPath || "/"), SITE_ORIGIN);
  } catch (_error) {
    return false;
  }

  const languageCode = url.searchParams.get("lang");
  if (!languageCode || !["en", "ar", "fr", "es", "it", "de"].includes(languageCode)) return false;

  url.searchParams.delete("lang");
  const canonicalPath = canonicalPathForRoute(url.pathname);
  url.pathname = publicPathForRoute(canonicalPath, languageCode);
  res.statusCode = 308;
  setSecurityHeaders(res, { cacheControl: "public, max-age=0, s-maxage=86400" });
  res.setHeader("Location", `${url.pathname}${url.search}`);
  res.end();
  return true;
}

module.exports = async (req, res) => {
  const rewrittenPath = req.query && req.query.path;
  const rewrittenLanguage = req.query && req.query.lang;
  const requestedPath = rewrittenPath
    ? publicPathForRoute(rewrittenPath, rewrittenLanguage || "en")
    : req.url || "/";
  const route = normalizePath(requestedPath);
  const sidecarCanonicalPath = canonicalPathForMarkdownPath(route);

  if (sidecarCanonicalPath) {
    const sidecarLanguage = languageFromPath(route);
    const markdown = readMarkdownForRoute(sidecarCanonicalPath, sidecarLanguage);
    if (!markdown) {
      const html = readHtmlForPath(publicPathForRoute(sidecarCanonicalPath, sidecarLanguage));
      if (!html) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        setSecurityHeaders(res, { cacheControl: "no-store" });
        endRepresentation(req, res, "Not found");
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      setSecurityHeaders(res);
      endRepresentation(req, res, html);
      return;
    }

    setMarkdownHeaders(res, sidecarCanonicalPath, { directSidecar: true, language: sidecarLanguage });
    await recordAgentEvent("agent_resource_read", {
      user_agent: req.headers["user-agent"] || "",
      resource_type: "markdown_sidecar",
      resource_path: markdownPublicPathForRoute(sidecarCanonicalPath, sidecarLanguage),
      representation: "text/markdown",
    });
    endRepresentation(req, res, markdown);
    return;
  }

  if (!rewrittenPath && redirectLegacyLanguageQuery(req, res, requestedPath)) return;
  if (redirectLegacyHtml(req, res, requestedPath)) return;

  const html = readHtmlForPath(requestedPath);

  if (!html) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    setSecurityHeaders(res, { cacheControl: "no-store" });
    endRepresentation(req, res, "Not found");
    return;
  }

  const canonicalPath = canonicalPathForRoute(route);
  const indexable = isIndexableCanonicalPath(canonicalPath);
  const languageCode = languageFromPath(requestedPath);

  if (indexable && wantsMarkdown(req) && !hasLanguageQuery(requestedPath)) {
    const markdown = readMarkdownForRoute(canonicalPath, languageCode);
    if (markdown) {
      setMarkdownHeaders(res, canonicalPath, { language: languageCode });
      await recordAgentEvent("agent_resource_read", {
        user_agent: req.headers["user-agent"] || "",
        resource_type: "markdown_negotiation",
        resource_path: canonicalPath,
        representation: "text/markdown",
      });
      endRepresentation(req, res, markdown);
      return;
    }
  }

  if (indexable) {
    setCanonicalHtmlHeaders(res, canonicalPath, languageCode);
  } else {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Language", languageCode);
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    setSecurityHeaders(res, { cacheControl: "no-store" });
  }

  const agentFamily = classifyUserAgent(req.headers["user-agent"] || "");
  if (agentFamily !== "browser_or_unknown_agent") {
    await recordAgentEvent("crawler_page_read", {
      agent_family: agentFamily,
      resource_type: "html_page",
      resource_path: canonicalPath,
      representation: "text/html",
    });
  }
  endRepresentation(req, res, html);
};
