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
  res.setHeader("X-Content-Type-Options", "nosniff");
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
        endRepresentation(req, res, "Not found");
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      endRepresentation(req, res, html);
      return;
    }

    setMarkdownHeaders(res, sidecarCanonicalPath, { directSidecar: true });
    endRepresentation(req, res, markdown);
    return;
  }

  if (redirectLegacyHtml(req, res, requestedPath)) return;

  const html = readHtmlForPath(requestedPath);

  if (!html) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
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
      endRepresentation(req, res, markdown);
      return;
    }
  }

  if (indexable) {
    setCanonicalHtmlHeaders(res, canonicalPath, languageCode);
  } else {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Language", languageCode);
  }
  endRepresentation(req, res, html);
};
