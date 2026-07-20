const {
  SITE_ORIGIN,
  canonicalPathForRoute,
  normalizePath,
  readHtmlForPath,
} = require("../lib/page-renderer");
const {
  canonicalPathForMarkdownPath,
  readMarkdownForRoute,
  setMarkdownHeaders,
  wantsMarkdown,
} = require("../lib/markdown-layer");

const LINK_HEADER_VALUE = [
  '</robots.txt>; rel="service-doc"; type="text/plain"',
  '</sitemap.xml>; rel="service-doc"; type="application/xml"',
  '</api/client-config.js>; rel="service-desc"; type="application/javascript"',
].join(", ");

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
        res.end("Not found");
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }

    setMarkdownHeaders(res, sidecarCanonicalPath, { directSidecar: true });
    res.end(markdown);
    return;
  }

  if (redirectLegacyHtml(req, res, requestedPath)) return;

  const html = readHtmlForPath(requestedPath);

  if (!html) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
    return;
  }

  if (route === "/") {
    res.setHeader("Link", LINK_HEADER_VALUE);
  }

  if (wantsMarkdown(req) && !String(requestedPath).includes("?")) {
    const canonicalPath = canonicalPathForRoute(route);
    const markdown = readMarkdownForRoute(canonicalPath);
    if (markdown) {
      setMarkdownHeaders(res, canonicalPath);
      res.end(markdown);
      return;
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
};
