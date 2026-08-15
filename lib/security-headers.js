const PUBLIC_CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com",
  "upgrade-insecure-requests",
].join("; ");

function setSecurityHeaders(res, options = {}) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  if (options.cache !== false) {
    res.setHeader("Cache-Control", options.cacheControl || PUBLIC_CACHE_CONTROL);
  }
}

module.exports = {
  CONTENT_SECURITY_POLICY,
  PUBLIC_CACHE_CONTROL,
  setSecurityHeaders,
};
