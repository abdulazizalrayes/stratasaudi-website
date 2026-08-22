const fs = require("fs");
const path = require("path");

const { renderLocalizedHtml } = require("./i18n-renderer");
const { metadataForRoute } = require("./page-metadata");

const SITE_DIR = path.join(__dirname, "..", "site");
const SITE_ORIGIN = "https://www.stratasaudi.com";

const SUPPORTED_LANGUAGES = [
  { code: "en", hreflang: "en", dir: "ltr" },
  { code: "ar", hreflang: "ar", dir: "rtl" },
  { code: "fr", hreflang: "fr", dir: "ltr" },
  { code: "es", hreflang: "es", dir: "ltr" },
  { code: "it", hreflang: "it", dir: "ltr" },
  { code: "de", hreflang: "de", dir: "ltr" },
];

const OG_LOCALES = {
  en: "en_US",
  ar: "ar_SA",
  fr: "fr_FR",
  es: "es_ES",
  it: "it_IT",
  de: "de_DE",
};

const PAGE_SEO_ROUTES = [
  { path: "/", file: "index.html", lastmod: "2026-08-20", changefreq: "weekly", priority: "1.0" },
  { path: "/about", file: "about.html", lastmod: "2026-08-20", changefreq: "monthly", priority: "0.8" },
  { path: "/services", file: "services.html", lastmod: "2026-08-20", changefreq: "weekly", priority: "0.9" },
  { path: "/counterparties", file: "counterparties.html", lastmod: "2026-08-20", changefreq: "monthly", priority: "0.8" },
  { path: "/why-saudi", file: "why-saudi.html", lastmod: "2026-08-20", changefreq: "monthly", priority: "0.8" },
  { path: "/insights", file: "insights.html", lastmod: "2026-08-20", changefreq: "weekly", priority: "0.8" },
  { path: "/faq", file: "faq.html", lastmod: "2026-08-20", changefreq: "monthly", priority: "0.8" },
  { path: "/ethics", file: "ethics.html", lastmod: "2026-08-20", changefreq: "monthly", priority: "0.7" },
  { path: "/contact", file: "contact.html", lastmod: "2026-08-20", changefreq: "monthly", priority: "0.8" },
  { path: "/privacy", file: "privacy.html", lastmod: "2026-08-20", changefreq: "monthly", priority: "0.6" },
  { path: "/terms", file: "terms.html", lastmod: "2026-08-20", changefreq: "monthly", priority: "0.6" },
  { path: "/mandate-checklist", file: "mandate-checklist.html", lastmod: "2026-08-20", changefreq: "monthly", priority: "0.7" },
  { path: "/fidic-claims-saudi-arabia", file: "fidic-claims-saudi-arabia.html", lastmod: "2026-08-20", changefreq: "monthly", priority: "0.8" },
];

const ROUTE_TO_FILE = {
  "/": "index.html",
  "/about": "about.html",
  "/about.html": "about.html",
  "/services": "services.html",
  "/services.html": "services.html",
  "/counterparties": "counterparties.html",
  "/counterparties.html": "counterparties.html",
  "/why-saudi": "why-saudi.html",
  "/why-saudi.html": "why-saudi.html",
  "/ethics": "ethics.html",
  "/ethics.html": "ethics.html",
  "/insights": "insights.html",
  "/insights.html": "insights.html",
  "/faq": "faq.html",
  "/faq.html": "faq.html",
  "/contact": "contact.html",
  "/contact.html": "contact.html",
  "/mandate-checklist": "mandate-checklist.html",
  "/mandate-checklist.html": "mandate-checklist.html",
  "/thank-you": "thank-you.html",
  "/thank-you.html": "thank-you.html",
  "/privacy": "privacy.html",
  "/privacy.html": "privacy.html",
  "/terms": "terms.html",
  "/terms.html": "terms.html",
  "/fidic-claims-saudi-arabia": "fidic-claims-saudi-arabia.html",
  "/fidic-claims-saudi-arabia.html": "fidic-claims-saudi-arabia.html",
};

const FILE_TO_CANONICAL_PATH = PAGE_SEO_ROUTES.reduce((map, page) => {
  map[page.file] = page.path;
  return map;
}, {});

function normalizePath(inputPath) {
  if (!inputPath || inputPath === "") return "/";
  const clean = inputPath.split("?")[0].replace(/\/$/, "");
  return clean === "" ? "/" : clean;
}

function basePathForRoute(inputPath) {
  const route = normalizePath(inputPath);
  const localized = route.match(/^\/(ar|fr|es|it|de)(?=\/|$)(.*)$/);
  if (!localized) return route;
  return localized[2] || "/";
}

function routeToFilePath(inputPath) {
  const route = basePathForRoute(inputPath);
  const file = ROUTE_TO_FILE[route];
  if (!file) return null;
  return path.join(SITE_DIR, file);
}

function languageFromPath(inputPath) {
  try {
    const url = new URL(String(inputPath || "/"), SITE_ORIGIN);
    const prefixed = url.pathname.match(/^\/(ar|fr|es|it|de)(?=\/|$)/);
    if (prefixed) return prefixed[1];
    const requested = url.searchParams.get("lang");
    if (SUPPORTED_LANGUAGES.some((language) => language.code === requested)) return requested;
  } catch (_error) {}
  return "en";
}

function canonicalPathForRoute(inputPath) {
  const route = basePathForRoute(inputPath);
  const file = ROUTE_TO_FILE[route];
  return FILE_TO_CANONICAL_PATH[file] || (route.endsWith(".html") ? route.slice(0, -5) : route);
}

function publicPathForRoute(inputPath, languageCode = "en") {
  const pathName = canonicalPathForRoute(inputPath);
  if (languageCode === "en") return pathName === "/" ? "/" : pathName;
  return pathName === "/" ? `/${languageCode}` : `/${languageCode}${pathName}`;
}

function publicUrlForRoute(inputPath, languageCode = "en") {
  return `${SITE_ORIGIN}${publicPathForRoute(inputPath, languageCode)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function languageConfig(languageCode) {
  return SUPPORTED_LANGUAGES.find((language) => language.code === languageCode) || SUPPORTED_LANGUAGES[0];
}

function hreflangTags(inputPath) {
  const tags = SUPPORTED_LANGUAGES.map(
    (language) =>
      `  <link rel="alternate" hreflang="${language.hreflang}" href="${escapeHtml(publicUrlForRoute(inputPath, language.code))}">`,
  );
  tags.push(`  <link rel="alternate" hreflang="x-default" href="${escapeHtml(publicUrlForRoute(inputPath, "en"))}">`);
  return tags.join("\n");
}

function normalizeAbsoluteStrataUrls(html) {
  let next = html.replace(/https:\/\/stratasaudi\.com/g, SITE_ORIGIN);
  const pagePaths = PAGE_SEO_ROUTES
    .map((page) => page.path)
    .filter((pagePath) => pagePath !== "/")
    .sort((a, b) => b.length - a.length);

  for (const pagePath of pagePaths) {
    const escaped = pagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(
      new RegExp(`${SITE_ORIGIN}${escaped}\\.html(?=([?#"'\\s<]|&quot;|$))`, "g"),
      `${SITE_ORIGIN}${pagePath}`,
    );
    next = next.replace(
      new RegExp(`(["'])${escaped}\\.html(?=([?#"'\\s<]|&quot;|$))`, "g"),
      `$1${pagePath}`,
    );
  }

  return next;
}

function replaceOrInsertMetaProperty(html, property, content) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta\\s+property=(["'])${escapedProperty}\\1\\s+content=(["'])([\\s\\S]*?)\\2\\s*\\/?>`,
    "i",
  );
  const tag = `<meta property="${property}" content="${escapeHtml(content)}">`;
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace("</head>", `  ${tag}\n</head>`);
}

function insertOgLocaleAlternates(html, languageCode) {
  const currentLocale = OG_LOCALES[languageCode] || OG_LOCALES.en;
  let next = replaceOrInsertMetaProperty(html, "og:locale", currentLocale);
  next = next.replace(/\s*<meta\s+property=["']og:locale:alternate["']\s+content=["'][^"']*["']\s*\/?>/gi, "\n");
  const alternateTags = SUPPORTED_LANGUAGES
    .map((language) => OG_LOCALES[language.code])
    .filter((locale) => locale && locale !== currentLocale)
    .map((locale) => `  <meta property="og:locale:alternate" content="${locale}">`)
    .join("\n");
  return next.replace(
    new RegExp(`(<meta\\s+property=["']og:locale["']\\s+content=["']${currentLocale}["']\\s*\\/?>)`, "i"),
    `$1\n${alternateTags}`,
  );
}

function entitySchemaScript() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_ORIGIN}/#organization`,
        name: "Strata Risk Advisory",
        alternateName: ["Strata Saudi", "Strata Risk Advisory Saudi Arabia"],
        url: `${SITE_ORIGIN}/`,
        logo: `${SITE_ORIGIN}/og-image.png`,
        image: `${SITE_ORIGIN}/og-image.png`,
        email: "advisory@stratasaudi.com",
        telephone: "+966500067865",
        sameAs: ["https://www.linkedin.com/company/stratasaudi"],
        founder: {
          "@id": `${SITE_ORIGIN}/#abdulaziz-alrayes`,
        },
        contactPoint: {
          "@type": "ContactPoint",
          email: "advisory@stratasaudi.com",
          telephone: "+966500067865",
          url: "https://wa.me/966500067865?text=Hello%20Strata%20Risk%20Advisory.%20I%20am%20contacting%20you%20through%20the%20Strata%20Saudi%20website%20regarding%20an%20enquiry.",
          contactType: "confidential advisory enquiries",
          availableLanguage: ["English", "Arabic", "French", "Spanish", "Italian", "German"],
          areaServed: ["SA", "GB", "US", "EU", "AE", "QA", "KW", "BH", "OM"],
        },
        knowsAbout: [
          "Saudi-governed construction contracts",
          "FIDIC notice compliance",
          "Contract risk advisory",
          "Project risk oversight",
          "Pre-litigation technical advisory",
          "Technical evidence mapping",
          "Delay and disruption analysis",
          "Supply chain and vendor risk assessment",
        ],
        subjectOf: [
          { "@id": `${SITE_ORIGIN}/data/company.json#company-data` },
          { "@id": `${SITE_ORIGIN}/llms-full.txt#agent-brief` },
          { "@id": `${SITE_ORIGIN}/.well-known/agent-card.json#agent-card` },
          { "@id": `${SITE_ORIGIN}/data/authority-evidence.json#authority-evidence` },
          { "@id": `${SITE_ORIGIN}/data/procurement-readiness.json#procurement-readiness` },
        ],
      },
      {
        "@type": "Person",
        "@id": `${SITE_ORIGIN}/#abdulaziz-alrayes`,
        name: "Eng Abdulaziz Alrayes",
        givenName: "Abdulaziz",
        familyName: "Alrayes",
        honorificPrefix: "Eng",
        jobTitle: "Founder and Principal Advisor",
        worksFor: {
          "@id": `${SITE_ORIGIN}/#organization`,
        },
        alumniOf: {
          "@type": "CollegeOrUniversity",
          name: "California State University",
        },
        description:
          "Founder and Principal Advisor of Strata Risk Advisory, a dual-qualified engineer with over two decades of Saudi project delivery, commercial management, governance, and dispute-exposure experience.",
        knowsAbout: [
          "Saudi construction project risk",
          "Engineering-led contract risk",
          "Commercial pre-litigation advisory",
          "Technical evidence review",
          "Saudi project governance",
        ],
      },
      {
        "@type": "ProfessionalService",
        "@id": `${SITE_ORIGIN}/#professional-service`,
        name: "Strata Risk Advisory",
        url: `${SITE_ORIGIN}/`,
        provider: {
          "@id": `${SITE_ORIGIN}/#organization`,
        },
        founder: {
          "@id": `${SITE_ORIGIN}/#abdulaziz-alrayes`,
        },
        serviceType: "Engineering-led contract-risk and pre-litigation technical advisory",
        slogan: "Contract risk in Saudi Arabia is technical before it is legal.",
        areaServed: {
          "@type": "Country",
          name: "Saudi Arabia",
        },
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          "@id": `${SITE_ORIGIN}/#offer-catalog`,
          name: "Strata Risk Advisory Mandates",
          itemListElement: [
            ["pre_contract_risk_review", "Pre-Contract Risk Review"],
            ["project_risk_oversight", "Project Risk Oversight"],
            ["pre_litigation_advisory", "Pre-Litigation Technical Advisory"],
            ["technical_opinion", "Independent Technical Opinion"],
            ["vendor_risk_assessment", "Supply Chain and Vendor Risk Assessment"],
            ["board_risk_briefing", "Board Risk Briefing"],
          ].map(([serviceId, name]) => ({
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              "@id": `${SITE_ORIGIN}/services#${serviceId}`,
              name,
              provider: {
                "@id": `${SITE_ORIGIN}/#organization`,
              },
              areaServed: "Saudi Arabia",
              serviceType: "Engineering-led technical and commercial advisory",
              termsOfService: `${SITE_ORIGIN}/terms`,
            },
          })),
        },
      },
      {
        "@type": "DefinedTermSet",
        "@id": `${SITE_ORIGIN}/#strata-risk-terms`,
        name: "Strata Saudi Advisory Terms",
        description:
          "Machine-readable terms used to describe engineering-led Saudi project-risk advisory, fit signals, and non-fit routing.",
        hasDefinedTerm: [
          ["contract_risk_mapping", "Contract risk mapping"],
          ["fidic_notice_discipline", "FIDIC notice discipline"],
          ["technical_evidence_mapping", "Technical evidence mapping"],
          ["pre_litigation_readiness", "Pre-litigation readiness"],
          ["board_decision_support", "Board decision support"],
          ["authority_evidence", "Authority evidence"],
          ["procurement_fit_screening", "Procurement fit screening"],
          ["non_fit_routing", "Non-fit routing"],
        ].map(([termCode, name]) => ({
          "@type": "DefinedTerm",
          "@id": `${SITE_ORIGIN}/data/capabilities.json#${termCode}`,
          termCode,
          name,
          inDefinedTermSet: `${SITE_ORIGIN}/#strata-risk-terms`,
        })),
      },
      {
        "@type": "HowTo",
        "@id": `${SITE_ORIGIN}/#prepare-project-inquiry`,
        name: "Prepare a Strata Saudi project inquiry for review",
        description:
          "A non-submitting preparation process for agents and users to organize Saudi project-risk context before any approved contact with Strata Risk Advisory.",
        supply: [
          "Saudi project context",
          "Contract or delivery stage",
          "Technical or commercial pressure point",
          "Decision needed",
          "Urgency and confidentiality constraints",
        ].map((name) => ({ "@type": "HowToSupply", name })),
        step: [
          "Confirm the matter involves Saudi project exposure or a Saudi-governed contract.",
          "Classify the request against Strata's fit and non-fit routing rules.",
          "Identify the likely advisory mandate.",
          "Prepare a concise inquiry draft for human review.",
          "Submit only after explicit user approval.",
        ].map((text, index) => ({
          "@type": "HowToStep",
          position: index + 1,
          text,
        })),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        url: `${SITE_ORIGIN}/`,
        name: "Strata Risk Advisory",
        publisher: {
          "@id": `${SITE_ORIGIN}/#organization`,
        },
        speakable: {
          "@type": "SpeakableSpecification",
          cssSelector: ["h1", ".hero-subtitle", ".section-text"],
        },
      },
    ],
  };

  return `<script type="application/ld+json" data-strata-entity-schema>\n${JSON.stringify(graph, null, 2)}\n</script>`;
}

function insertEntitySchema(html) {
  if (html.includes("data-strata-entity-schema")) return html;
  return html.replace("</head>", `  ${entitySchemaScript()}\n</head>`);
}

function replaceOrInsertMetaName(html, name, content) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta\\s+name=(["'])${escapedName}\\1\\s+content=(["'])([\\s\\S]*?)\\2\\s*\\/?>`,
    "i",
  );
  const tag = `<meta name="${name}" content="${escapeHtml(content)}">`;
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace("</head>", `  ${tag}\n</head>`);
}

function replaceOrInsertTitle(html, title) {
  const tag = `<title>${escapeHtml(title)}</title>`;
  if (/<title>[\s\S]*?<\/title>/i.test(html)) return html.replace(/<title>[\s\S]*?<\/title>/i, tag);
  return html.replace("</head>", `  ${tag}\n</head>`);
}

function applySocialMetadata(inputPath, languageCode, html) {
  const route = canonicalPathForRoute(inputPath);
  const metadata = metadataForRoute(route, languageCode);
  if (!metadata) return html;

  let next = replaceOrInsertTitle(html, metadata.title);
  next = replaceOrInsertMetaName(next, "description", metadata.description);
  next = replaceOrInsertMetaProperty(next, "og:type", metadata.type);
  next = replaceOrInsertMetaProperty(next, "og:title", metadata.title);
  next = replaceOrInsertMetaProperty(next, "og:description", metadata.description);
  next = replaceOrInsertMetaProperty(next, "og:site_name", "Strata Risk Advisory");
  next = replaceOrInsertMetaProperty(next, "og:image", `${SITE_ORIGIN}/og-image.png`);
  next = replaceOrInsertMetaProperty(next, "og:image:width", "1200");
  next = replaceOrInsertMetaProperty(next, "og:image:height", "630");
  next = replaceOrInsertMetaProperty(next, "og:image:alt", "Strata Risk Advisory");
  next = replaceOrInsertMetaName(next, "twitter:card", "summary_large_image");
  next = replaceOrInsertMetaName(next, "twitter:title", metadata.title);
  next = replaceOrInsertMetaName(next, "twitter:description", metadata.description);
  next = replaceOrInsertMetaName(next, "twitter:image", `${SITE_ORIGIN}/og-image.png`);
  next = replaceOrInsertMetaName(next, "twitter:image:alt", "Strata Risk Advisory");
  return next;
}

function setHtmlLanguage(html, languageCode) {
  const language = languageConfig(languageCode);
  return html.replace(/<html\b([^>]*)>/i, (_match, rawAttributes) => {
    const attributes = String(rawAttributes || "")
      .replace(/\s+lang=(["']).*?\1/i, "")
      .replace(/\s+dir=(["']).*?\1/i, "")
      .replace(/\s+data-language=(["']).*?\1/i, "")
      .trim();
    return `<html lang="${language.code}" dir="${language.dir}" data-language="${language.code}"${attributes ? ` ${attributes}` : ""}>`;
  });
}

function applySeoMetadata(inputPath, html) {
  const languageCode = languageFromPath(inputPath);
  const canonicalUrl = publicUrlForRoute(inputPath, languageCode);
  let next = normalizeAbsoluteStrataUrls(html);

  next = renderLocalizedHtml(next, languageCode, publicPathForRoute);
  next = setHtmlLanguage(next, languageCode);
  next = next
    .replace(/\s*<link\s+rel=["']canonical["'][^>]*>\s*/gi, "\n")
    .replace(/\s*<link\s+rel=["']alternate["'][^>]*hreflang=["'][^>]*>\s*/gi, "\n");

  const seoBlock = [
    `  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `  <link rel="ai-catalog" href="${SITE_ORIGIN}/.well-known/ai-catalog.json" type="application/json">`,
    hreflangTags(inputPath),
  ].join("\n");

  if (/<meta\s+name=["']googlebot["'][^>]*>/i.test(next)) {
    next = next.replace(/(<meta\s+name=["']googlebot["'][^>]*>\s*)/i, `$1\n${seoBlock}\n`);
  } else {
    next = next.replace("</head>", `${seoBlock}\n</head>`);
  }

  next = replaceOrInsertMetaProperty(next, "og:url", canonicalUrl);
  next = applySocialMetadata(inputPath, languageCode, next);
  next = insertOgLocaleAlternates(next, languageCode);
  next = insertEntitySchema(next);
  if (canonicalPathForRoute(inputPath) === "/thank-you") {
    next = replaceOrInsertMetaName(next, "robots", "noindex, nofollow");
  }

  return next;
}

function readHtmlForPath(inputPath) {
  const filePath = routeToFilePath(inputPath);
  if (!filePath) return null;
  return applySeoMetadata(inputPath, fs.readFileSync(filePath, "utf8"));
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeEntities(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function matchOne(pattern, text) {
  const match = text.match(pattern);
  return match ? stripTags(match[1]) : "";
}

function matchAll(pattern, text) {
  return [...text.matchAll(pattern)].map((match) => stripTags(match[1])).filter(Boolean);
}

function uniqueCompact(values, maxLength) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].filter(
    (value) => value.length <= maxLength,
  );
}

function toMarkdown(inputPath, html) {
  const route = normalizePath(inputPath);
  const title = matchOne(/<title>([\s\S]*?)<\/title>/i, html);
  const description = matchOne(
    /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i,
    html,
  );
  const h1 = matchOne(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html);
  const h2s = uniqueCompact(matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, html), 120);
  const paragraphs = uniqueCompact(matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi, html), 600).slice(0, 8);
  const listItems = uniqueCompact(matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi, html), 220).slice(0, 12);

  const lines = [];
  if (title) lines.push(`# ${title}`);
  if (route) lines.push(`Source: https://www.stratasaudi.com${route === "/" ? "" : route}`);
  if (description) {
    lines.push("");
    lines.push(description);
  }
  if (h1 && h1 !== title) {
    lines.push("");
    lines.push(`## ${h1}`);
  }
  if (paragraphs.length) {
    lines.push("");
    for (const paragraph of paragraphs) lines.push(paragraph);
  }
  if (h2s.length) {
    lines.push("");
    lines.push("## Key Sections");
    for (const heading of h2s) lines.push(`- ${heading}`);
  }
  if (listItems.length) {
    lines.push("");
    lines.push("## Highlights");
    for (const item of listItems) lines.push(`- ${item}`);
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  PAGE_SEO_ROUTES,
  SUPPORTED_LANGUAGES,
  SITE_ORIGIN,
  applySeoMetadata,
  basePathForRoute,
  canonicalPathForRoute,
  languageFromPath,
  normalizePath,
  publicPathForRoute,
  publicUrlForRoute,
  readHtmlForPath,
  toMarkdown,
};
