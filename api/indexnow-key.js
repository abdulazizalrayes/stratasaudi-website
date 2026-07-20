const INDEXNOW_KEY = "0957b4b1b950a90f9ac51a5a737203ec";

module.exports = async (_req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  res.end(INDEXNOW_KEY);
};
