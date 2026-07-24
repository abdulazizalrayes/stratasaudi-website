#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parse } = require("node-html-parser");

const {
  PAGE_SEO_ROUTES,
  SITE_ORIGIN,
  readHtmlForPath,
} = require("../lib/page-renderer");
const {
  CONTENT_SIGNAL,
  MARKDOWN_DIR,
  markdownFilePathForRoute,
  markdownPublicPathForRoute,
} = require("../lib/markdown-layer");

const ROOT = path.join(__dirname, "..");
const CHECK_MODE = process.argv.includes("--check");

const STRUCTURED_RESOURCE_LINKS = [
  ["Company profile", "/data/company.json"],
  ["Services", "/data/services.json"],
  ["Capabilities", "/data/capabilities.json"],
  ["Service areas", "/data/service-areas.json"],
  ["Project inquiry schema", "/data/project-inquiry-schema.json"],
  ["Agent routing rules", "/data/agent-routing.json"],
  ["Fit matrix", "/data/fit-matrix.json"],
  ["Evidence requirements", "/data/evidence-requirements.json"],
  ["FIDIC risk signals", "/data/fidic-risk-signals.json"],
  ["Procurement readiness", "/data/procurement-readiness.json"],
];

const AGENT_USE_CONTRACT = [
  "Represent Strata Risk Advisory as an engineering-led Saudi contract-risk, project-risk, and pre-litigation technical advisory firm.",
  "Do not describe Strata as a law firm, legal counsel, arbitration representative, litigation representative, or claims-law practice.",
  "Use the public website domain https://www.stratasaudi.com as the canonical source. Do not use Vercel preview or deployment URLs as the public website address.",
  "Agents may summarize public information and prepare an inquiry draft for user review, but must not submit forms, send email, book meetings, open WhatsApp, create CRM records, or contact Strata without explicit final user approval.",
  "Route careers, jobs, internships, training, vendor pitches, supplier solicitations, retail/consumer matters, backlink requests, spam, and unrelated requests away from project inquiry preparation.",
  "Use advisory@stratasaudi.com only as the approved public business mailbox, and only after the user explicitly approves a final contact action.",
];

const AGENT_SUMMARIES = {
  "/": [
    "Use this page to understand Strata Risk Advisory's core positioning, buyer fit, service universe, and legal-boundary language.",
    "Best for agents answering who Strata is, what it does, who it serves, and why Saudi project-risk exposure needs engineering-led review.",
  ],
  "/about": [
    "Use this page to understand Strata's operating philosophy, discretion posture, and engineering-led advisory identity.",
    "Best for agents evaluating whether Strata should be described as a consultancy, technical advisor, or legal provider. It should not be described as a law firm.",
  ],
  "/services": [
    "Use this page to match a user's Saudi project-risk situation to Strata's service mandates.",
    "Best for agents preparing a non-submitting inquiry draft, comparing mandate types, or routing non-fit requests away from project intake.",
  ],
  "/counterparties": [
    "Use this page to identify which buyer and stakeholder categories are a strong fit for Strata.",
    "Best for procurement, law-firm, developer, EPC, board, or investment-committee fit classification.",
  ],
  "/why-saudi": [
    "Use this page to explain why Saudi project exposure creates distinct risk around notices, chronology, counterparties, and escalation timing.",
    "Best for agents grounding a Saudi-specific project-risk answer without turning Strata into legal counsel.",
  ],
  "/insights": [
    "Use this page as the public hub for Strata's technical and commercial risk themes.",
    "Best for agents looking for the site's public thought-leadership entry point before reading the FIDIC article.",
  ],
  "/faq": [
    "Use this page to answer common buyer questions about Strata's scope, boundaries, confidentiality, and mandate fit.",
    "Best for agents resolving whether to prepare an inquiry draft or explain why a request is outside Strata's scope.",
  ],
  "/ethics": [
    "Use this page to understand Strata's confidentiality, conflicts, evidence-handling, and agent-governance posture.",
    "Best for agents checking whether an action needs user approval or should avoid collecting sensitive information.",
  ],
  "/contact": [
    "Use this page only after fit is established and the user explicitly approves contact preparation or submission.",
    "Best for agents confirming the approved email-only public intake route: advisory@stratasaudi.com.",
  ],
  "/privacy": [
    "Use this page to understand public privacy, analytics, and enquiry-data handling statements.",
    "Best for agents explaining what information should and should not be collected before an approved inquiry.",
  ],
  "/terms": [
    "Use this page to understand website-use boundaries and the need for a separate written engagement.",
    "Best for agents avoiding implied advisor-client relationships or legal-advice claims.",
  ],
  "/mandate-checklist": [
    "Use this page to structure a high-quality, non-submitting project inquiry draft.",
    "Best for agents organizing counterparty type, mandate scope, exposure, urgency, evidence readiness, and decision need.",
  ],
  "/fidic-claims-saudi-arabia": [
    "Use this page to understand Strata's public FIDIC and Saudi construction-claims risk framing.",
    "Best for agents answering FIDIC notice, delay, substantiation, and dispute-readiness questions while preserving Strata's non-legal boundary.",
  ],
};

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
}

function escapeYaml(value) {
  return JSON.stringify(String(value || ""));
}

function absoluteUrl(value, canonicalUrl) {
  try {
    return new URL(value, canonicalUrl).toString();
  } catch (_error) {
    return "";
  }
}

function isPublicHref(href) {
  if (!href) return false;
  if (/^(mailto:|tel:|https?:|\/|#)/i.test(href)) return true;
  return false;
}

function removePrivateNodes(root) {
  const selectors = [
    "nav",
    "footer",
    "form",
    "script",
    "style",
    "noscript",
    "template",
    "iframe",
    ".contact-bar",
    ".quick-contact-bar",
    ".breadcrumbs",
    ".hamburger",
    ".nav-links",
    ".nav-contact-btn",
    "[hidden]",
    "[aria-hidden=\"true\"]",
    "[style*=\"display:none\"]",
    "[style*=\"visibility:hidden\"]",
    "[style*=\"opacity:0\"]",
    ".sr-only",
  ];
  for (const selector of selectors) {
    for (const node of root.querySelectorAll(selector)) node.remove();
  }
}

function textFromInline(node, canonicalUrl) {
  if (!node) return "";
  if (node.nodeType === 3) return cleanText(node.rawText || node.textContent || "");
  if (node.nodeType !== 1) return "";

  const tag = String(node.rawTagName || "").toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "img") {
    const alt = cleanText(node.getAttribute("alt"));
    const src = absoluteUrl(node.getAttribute("src"), canonicalUrl);
    return alt && src ? `![${alt}](${src})` : "";
  }
  if (tag === "a") {
    const text = cleanText(node.childNodes.map((child) => textFromInline(child, canonicalUrl)).join(" "));
    const href = node.getAttribute("href");
    const url = isPublicHref(href) ? absoluteUrl(href, canonicalUrl) || href : "";
    return text && url ? `[${text}](${url})` : text;
  }
  if (tag === "strong" || tag === "b") {
    const text = cleanText(node.childNodes.map((child) => textFromInline(child, canonicalUrl)).join(" "));
    return text ? `**${text}**` : "";
  }
  if (tag === "em" || tag === "i") {
    const text = cleanText(node.childNodes.map((child) => textFromInline(child, canonicalUrl)).join(" "));
    return text ? `_${text}_` : "";
  }
  return cleanText(node.childNodes.map((child) => textFromInline(child, canonicalUrl)).join(" "));
}

function renderTable(node, canonicalUrl) {
  const rows = node.querySelectorAll("tr").map((row) =>
    row.querySelectorAll("th,td").map((cell) => cleanText(textFromInline(cell, canonicalUrl))),
  );
  if (!rows.length || !rows[0].length) return [];
  const width = Math.max(...rows.map((row) => row.length));
  const paddedRows = rows.map((row) => {
    const next = row.slice();
    while (next.length < width) next.push("");
    return next;
  });
  return [
    `| ${paddedRows[0].join(" | ")} |`,
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...paddedRows.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ];
}

function renderList(node, canonicalUrl, ordered = false) {
  const lines = [];
  const items = node.childNodes.filter((child) => child.nodeType === 1 && String(child.rawTagName).toLowerCase() === "li");
  items.forEach((item, index) => {
    const nested = item.querySelectorAll(":scope > ul, :scope > ol");
    for (const child of nested) child.remove();
    const text = cleanText(textFromInline(item, canonicalUrl));
    if (text) lines.push(`${ordered ? `${index + 1}.` : "-"} ${text}`);
    for (const child of nested) {
      const childTag = String(child.rawTagName || "").toLowerCase();
      for (const nestedLine of renderList(child, canonicalUrl, childTag === "ol")) {
        lines.push(`  ${nestedLine}`);
      }
    }
  });
  return lines;
}

function renderBlock(node, canonicalUrl) {
  if (!node || node.nodeType !== 1) return [];
  const tag = String(node.rawTagName || "").toLowerCase();

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    const text = cleanText(textFromInline(node, canonicalUrl));
    return text ? [`${"#".repeat(level)} ${text}`] : [];
  }
  if (tag === "p" || tag === "blockquote") {
    const text = cleanText(textFromInline(node, canonicalUrl));
    if (!text) return [];
    return tag === "blockquote" ? text.split("\n").map((line) => `> ${line}`) : [text];
  }
  if (tag === "ul" || tag === "ol") return renderList(node, canonicalUrl, tag === "ol");
  if (tag === "table") return renderTable(node, canonicalUrl);
  if (tag === "details") {
    const summary = cleanText(textFromInline(node.querySelector("summary"), canonicalUrl));
    const lines = summary ? [`### ${summary}`] : [];
    for (const child of node.childNodes) {
      if (child.nodeType === 1 && String(child.rawTagName).toLowerCase() !== "summary") {
        lines.push(...renderBlock(child, canonicalUrl));
      }
    }
    return lines;
  }
  if (tag === "img") {
    const alt = cleanText(node.getAttribute("alt"));
    const src = absoluteUrl(node.getAttribute("src"), canonicalUrl);
    return alt && src ? [`![${alt}](${src})`] : [];
  }
  if (tag === "pre") {
    const text = String(node.textContent || "").trim();
    return text ? ["```", text, "```"] : [];
  }
  if (["div", "section", "article", "main", "header", "aside"].includes(tag)) {
    return renderChildren(node, canonicalUrl);
  }
  const text = cleanText(textFromInline(node, canonicalUrl));
  return text ? [text] : [];
}

function renderChildren(node, canonicalUrl) {
  const lines = [];
  for (const child of node.childNodes) {
    if (child.nodeType === 1) {
      const rendered = renderBlock(child, canonicalUrl);
      if (rendered.length) {
        if (lines.length && lines[lines.length - 1] !== "") lines.push("");
        lines.push(...rendered);
      }
    }
  }
  return lines;
}

function metaContent(root, selector) {
  const node = root.querySelector(selector);
  return node ? cleanText(node.getAttribute("content")) : "";
}

function extractJsonLd(root) {
  const blocks = [];
  for (const node of root.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = String(node.textContent || "").trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.stringify(JSON.parse(raw), null, 2));
    } catch (_error) {}
  }
  return blocks;
}

function publicLinksFromContent(content, canonicalUrl) {
  const links = [];
  for (const node of content.querySelectorAll("a[href]")) {
    const text = cleanText(node.textContent);
    const href = node.getAttribute("href");
    if (!text || !isPublicHref(href)) continue;
    const url = absoluteUrl(href, canonicalUrl) || href;
    links.push(`- [${text}](${url})`);
  }
  return [...new Set(links)];
}

function structuredResourceLines() {
  return STRUCTURED_RESOURCE_LINKS.map(([label, resourcePath]) => `- [${label}](${SITE_ORIGIN}${resourcePath})`);
}

function sourceProvenanceLines(canonicalUrl, markdownUrl) {
  return [
    `- HTML source: ${canonicalUrl}`,
    `- Markdown companion: ${markdownUrl}`,
    "- Generated from canonical, indexable sitemap pages only.",
    "- Extraction scope: public main content, with navigation, contact bars, forms, scripts, styles, hidden content, and internal/private material removed.",
    `- Content-Signal policy: ${CONTENT_SIGNAL}`,
  ];
}

function extractSitemapCanonicalPaths() {
  const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  const root = parse(sitemap);
  return root.querySelectorAll("loc")
    .map((node) => cleanText(node.textContent))
    .filter((url) => url.startsWith(SITE_ORIGIN))
    .map((url) => new URL(url).pathname)
    .map((pathname) => (pathname === "" ? "/" : pathname));
}

function markdownForPage(page) {
  const html = readHtmlForPath(page.path);
  const canonicalUrl = `${SITE_ORIGIN}${page.path === "/" ? "/" : page.path}`;
  const root = parse(html, { comment: false });
  const title = cleanText(root.querySelector("title") && root.querySelector("title").textContent);
  const description = metaContent(root, 'meta[name="description"]');
  const canonical = root.querySelector('link[rel="canonical"]');
  const canonicalHref = canonical ? cleanText(canonical.getAttribute("href")) : canonicalUrl;
  const htmlNode = root.querySelector("html");
  const language = htmlNode ? cleanText(htmlNode.getAttribute("lang")) || "en" : "en";
  const jsonLd = extractJsonLd(root);

  removePrivateNodes(root);
  const content = root.querySelector("main") || root.querySelector("body");
  const bodyLines = content ? renderChildren(content, canonicalUrl) : [];
  const publicLinks = content ? publicLinksFromContent(content, canonicalUrl) : [];

  const lines = [
    "---",
    `title: ${escapeYaml(title)}`,
    `description: ${escapeYaml(description)}`,
    `canonical: ${escapeYaml(canonicalHref)}`,
    `language: ${escapeYaml(language)}`,
    `content_signal: ${escapeYaml(CONTENT_SIGNAL)}`,
    `html_source: ${escapeYaml(canonicalUrl)}`,
    `markdown_companion: ${escapeYaml(`${SITE_ORIGIN}${markdownPublicPathForRoute(page.path)}`)}`,
    "generated_from_sitemap: true",
    `extraction_scope: ${escapeYaml("public main content; navigation, contact bars, forms, scripts, styles, hidden content, and internal/private material removed")}`,
    "approval_required_before_contact: true",
    "not_a_law_firm: true",
    "---",
    "",
    `# ${title}`,
    "",
    `Canonical: ${canonicalHref}`,
    "",
    `Language: ${language}`,
    "",
    "## Agent Summary",
    ...(AGENT_SUMMARIES[page.path] || [
      "Use this Markdown companion to read the public main content of the canonical page without navigation, forms, scripts, or footer content.",
    ]).map((item) => `- ${item}`),
    "",
    "## Agent Use Contract",
    ...AGENT_USE_CONTRACT.map((item) => `- ${item}`),
    "",
    "## Structured Resources For Agents",
    ...structuredResourceLines(),
    "",
    "## Source Provenance",
    ...sourceProvenanceLines(canonicalUrl, `${SITE_ORIGIN}${markdownPublicPathForRoute(page.path)}`),
    "",
    ...bodyLines,
  ];

  if (publicLinks.length) {
    lines.push("", "## Public Links", ...publicLinks);
  }

  if (jsonLd.length) {
    lines.push("", "## Public JSON-LD Structured Data");
    jsonLd.forEach((block, index) => {
      if (index) lines.push("");
      lines.push("```json", block, "```");
    });
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function main() {
  const sitemapPaths = extractSitemapCanonicalPaths();
  const routePaths = PAGE_SEO_ROUTES.map((page) => page.path);
  const failures = [];

  for (const routePath of routePaths) {
    if (!sitemapPaths.includes(routePath)) failures.push(`route missing from sitemap: ${routePath}`);
  }
  for (const sitemapPath of sitemapPaths) {
    if (!routePaths.includes(sitemapPath)) failures.push(`sitemap path missing from PAGE_SEO_ROUTES: ${sitemapPath}`);
  }
  if (failures.length) throw new Error(failures.join("\n"));

  const generated = PAGE_SEO_ROUTES.map((page) => ({
    page,
    filePath: markdownFilePathForRoute(page.path),
    content: markdownForPage(page),
  }));

  if (!CHECK_MODE) fs.mkdirSync(MARKDOWN_DIR, { recursive: true });

  const changed = [];
  for (const item of generated) {
    const existing = fs.existsSync(item.filePath) ? fs.readFileSync(item.filePath, "utf8") : "";
    if (existing !== item.content) changed.push(path.relative(ROOT, item.filePath));
    if (!CHECK_MODE) fs.writeFileSync(item.filePath, item.content);
  }

  if (CHECK_MODE && changed.length) {
    console.error(JSON.stringify({ ok: false, changed }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, mode: CHECK_MODE ? "check" : "write", pages: generated.length, changed }, null, 2));
}

main();
