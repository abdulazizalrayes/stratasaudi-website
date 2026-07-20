module.exports = async (_req, res) => {
  const bool = (value) => String(value || "").toLowerCase() === "true";
  const approvedMailbox = "advisory@stratasaudi.com";
  const canonicalSiteUrl = "https://www.stratasaudi.com/";
  const canonicalLinkedInCompanyUrl = "https://www.linkedin.com/company/stratasaudi";
  const safeUrl = (value, fallback) => {
    try {
      const parsed = new URL(String(value || fallback || ""), "https://www.stratasaudi.com");
      return parsed.protocol === "https:" ? parsed.toString() : fallback;
    } catch (_error) {
      return fallback;
    }
  };
  const optionalSafeUrl = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const parsed = new URL(raw, "https://www.stratasaudi.com");
      if (parsed.protocol !== "https:") return "";
      if (/^\/in\/strata-saudi\/?$/i.test(parsed.pathname)) return "";
      return parsed.toString();
    } catch (_error) {
      return "";
    }
  };
  const safeCompanyLinkedInUrl = (value) => {
    const raw = String(value || "").trim();
    if (/linkedin\.com\/company\/strata-saudi\/?$/i.test(raw)) {
      return canonicalLinkedInCompanyUrl;
    }
    return safeUrl(raw, canonicalLinkedInCompanyUrl);
  };
  const contactEmail =
    String(process.env.CONTACT_EMAIL || approvedMailbox).trim().toLowerCase() === approvedMailbox
      ? approvedMailbox
      : approvedMailbox;

  const payload = {
    appDomain: process.env.APP_DOMAIN || "stratasaudi.com",
    primarySiteUrl: canonicalSiteUrl,
    contactEmail,
    linkedinCompanyUrl: safeCompanyLinkedInUrl(process.env.LINKEDIN_COMPANY_URL),
    linkedinFounderUrl: optionalSafeUrl(process.env.LINKEDIN_FOUNDER_URL),
    gaMeasurementId: process.env.GA_MEASUREMENT_ID || "",
    gtmId: process.env.GTM_ID || "",
    gaDebugMode: bool(process.env.GA_DEBUG_MODE),
  };

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.end(`window.STRATA_RUNTIME_CONFIG = ${JSON.stringify(payload)};`);
};
