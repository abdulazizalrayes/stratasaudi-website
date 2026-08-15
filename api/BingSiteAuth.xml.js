const { setSecurityHeaders } = require("../lib/security-headers");

module.exports = (req, res) => {
  setSecurityHeaders(res, { cacheControl: "public, max-age=0, s-maxage=3600" });
  const content = process.env.BING_SITE_AUTH_XML || "";

  if (!content.trim()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not Found");
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.end(content);
};
