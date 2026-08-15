const INDEXNOW_KEY = "0957b4b1b950a90f9ac51a5a737203ec";
const { setSecurityHeaders } = require("../lib/security-headers");

module.exports = async (_req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  setSecurityHeaders(res, { cacheControl: "public, max-age=300, s-maxage=300" });
  res.end(INDEXNOW_KEY);
};
