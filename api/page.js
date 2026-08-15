const {
  PAGE_SEO_ROUTES,
  SITE_ORIGIN,
  canonicalPathForRoute,
  languageFromPath,
  normalizePath,
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

function markdownAlternateLink(canonicalPath) {
  const markdownUrl = `${SITE_ORIGIN}${markdownPublicPathForRoute(canonicalPath)}`;
  return `<${markdownUrl}>; rel="alternate"; type="text/markdown"`;
}

function setCanonicalHtmlHeaders(res, canonicalPath, languageCode) {
  const links = [markdownAlternateLink(canonicalPath)];
  if (canonicalPath === "/") links.push(...ROOT_SERVICE_LINKS);
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
  if (!canonicalPath || canonicalPath === route) return false;

  const url = new URL(req.url || requestedPath, SITE_ORIGIN);
  url.pathname = canonicalPath;
  res.statusCode = 308;
  setSecurityHeaders(res, { cacheControl: "public, max-age=0, s-maxage=86400" });
  res.setHeader("Location", `${url.pathname}${url.search}`);
  res.end();
  return true;
}

module.exports = async (req, res) => {
  const requestedPath = (req.query && req.query.path) || req.url || "/";
  const route = normalizePath(requestedPath);
  const sidecarCanonicalPath = canonicalPathForMarkdownPath(route);

  if (sidecarCanonicalPath) {
    const markdown = readMarkdownForRoute(sidecarCanonicalPath);
    if (!markdown) {
      const html = readHtmlForPath(sidecarCanonicalPath);
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

    setMarkdownHeaders(res, sidecarCanonicalPath, { directSidecar: true });
    await recordAgentEvent("agent_resource_read", {
      user_agent: req.headers["user-agent"] || "",
      resource_type: "markdown_sidecar",
      resource_path: markdownPublicPathForRoute(sidecarCanonicalPath),
      representation: "text/markdown",
    });
    endRepresentation(req, res, markdown);
    return;
  }

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
    const markdown = readMarkdownForRoute(canonicalPath);
    if (markdown) {
      setMarkdownHeaders(res, canonicalPath);
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
    if (hasLanguageQuery(requestedPath)) {
      res.setHeader("X-Robots-Tag", "noindex, follow");
    }
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
