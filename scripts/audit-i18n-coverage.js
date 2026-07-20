#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");
const DICTIONARY_PATH = path.join(ROOT, "assets", "i18n-dictionary.js");
const LANGUAGES = ["ar", "fr", "es", "it", "de"];
const QUALITY_BLOCKLIST = {
  ar: [
    /تحقيق سري/,
    /مؤتمن/,
    /FIDIC المطالبات/,
    /تحكمها الحكومة السعودية/,
    /الذخيرة التقنية/,
    /المطالبات FIDIC/,
  ],
  fr: [
    /Enquête confidentielle/,
    /sinistres/,
    /FIDIC sinistres/,
    /FIDIC Réclamations/,
    /avant d’être légal/,
    /gouvernés par l'Arabie saoudite/,
  ],
  es: [
    /FIDIC Reclamaciones/,
    /FIDIC reclamos/,
    /los reclamaciones/,
    /Los reclamaciones/,
    /Las afirmaciones/,
    /gobernad[oa]s por Arabia Saudita/,
    /Riesgo de construcción y FIDIC Información/,
  ],
  it: [
    /sinistri FIDIC/,
    /FIDIC Reclami/,
    /FIDIC Rivendica/,
    /Le affermazioni/,
    /dei rivendicazioni/,
    /i rivendicazioni/,
    /governati dall'Arabia Saudita/,
  ],
  de: [
    /Schadenmanagement/,
    /Schadensexpertise/,
    /FIDIC Schadens/,
    /FIDIC Ansprüche/,
    /Schadenslage/,
    /Schaden- und Risikomanagement/,
    /legal ist/,
    /technische Munition/,
    /von Saudi-Arabien verwalteter/,
  ],
};
const EXTRA_STRINGS = [
  "Home",
  "About",
  "Mandates",
  "Counterparties",
  "Risk Landscape",
  "Risk landscape",
  "Insights",
  "FAQ",
  "Confidential Enquiry",
  "Open navigation",
  "Request advisory review",
  "Engineering-led risk advisory",
  "Selective advisory for Saudi project exposure",
  "Independent technical advisory for contract risk, project risk, dispute-readiness, and premium mandate structuring in the Kingdom of Saudi Arabia.",
  "LinkedIn",
  "Practice",
  "Mandate lines",
  "Target counterparties",
  "Authority",
  "Insights hub",
  "Governance",
  "Company",
  "Privacy",
  "Terms",
  "Riyadh, Saudi Arabia",
  "Submitting securely...",
  "Unable to send enquiry.",
  "Language selector",
];

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&copy;/g, "©")
    .replace(/&middot;/g, "·")
    .replace(/&rarr;/g, "→")
    .replace(/&nbsp;/g, " ");
}

function cleanHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
}

function normalize(value) {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

function isTranslatable(value) {
  const source = normalize(value);
  if (!source) return false;
  if (/^[\d\s.,:+/()$%-]+$/.test(source)) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source)) return false;
  if (/^https?:\/\//i.test(source)) return false;
  return /[A-Za-z\u0600-\u06ff]/.test(source);
}

function extractText(html) {
  const clean = cleanHtml(html);
  const values = [];
  const textPattern = />\s*([^<>]*?\S[^<>]*?)\s*</g;
  const attributePattern = /\s(?:placeholder|aria-label|title|alt)=["']([^"']*?[A-Za-z][^"']*?)["']/gi;
  const metaContentPattern =
    /<meta\b(?=[^>]*(?:name|property)=["'](?:description|og:title|og:description|twitter:title|twitter:description)["'])(?=[^>]*content=["']([^"']*?[A-Za-z][^"']*?)["'])[^>]*>/gi;
  let match;
  while ((match = textPattern.exec(clean))) values.push(normalize(match[1]));
  while ((match = attributePattern.exec(clean))) values.push(normalize(match[1]));
  while ((match = metaContentPattern.exec(clean))) values.push(normalize(match[1]));
  return values.filter(isTranslatable);
}

function readSources() {
  const values = [];
  for (const file of fs.readdirSync(SITE_DIR).filter((name) => name.endsWith(".html"))) {
    values.push(...extractText(fs.readFileSync(path.join(SITE_DIR, file), "utf8")));
  }
  values.push(...EXTRA_STRINGS);
  return [...new Set(values.map(normalize).filter(isTranslatable))].sort((a, b) => a.localeCompare(b));
}

function readDictionary() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(DICTIONARY_PATH, "utf8"), context);
  return context.window.StrataI18nDictionary || {};
}

function isAllowedUnchanged(source) {
  return (
    /^[A-Z0-9&/ .:+-]+$/.test(source) ||
    /^(Strata|FIDIC|NEOM|Trojena|Oxagon|OpenCode|Codex|Claude Code|Paperclip|RevOps|GTM|GA4|DAB|ICC|LCIA|CPM|LinkedIn|WhatsApp)/.test(source)
  );
}

function main() {
  const sources = readSources();
  const dictionary = readDictionary();
  const missing = [];
  const unchanged = [];
  const qualityIssues = [];

  for (const language of LANGUAGES) {
    for (const source of sources) {
      const translated = dictionary[language] && dictionary[language][source];
      if (!translated) {
        missing.push({ language, source });
      } else if (translated === source && !isAllowedUnchanged(source)) {
        unchanged.push({ language, source });
      }

      if (translated && QUALITY_BLOCKLIST[language]) {
        for (const pattern of QUALITY_BLOCKLIST[language]) {
          if (pattern.test(translated)) {
            qualityIssues.push({ language, source, translated, pattern: String(pattern) });
            break;
          }
        }
      }
    }
  }

  const result = {
    ok: missing.length === 0 && qualityIssues.length === 0,
    sourceCount: sources.length,
    languages: LANGUAGES,
    missingCount: missing.length,
    qualityIssueCount: qualityIssues.length,
    unchangedReviewCount: unchanged.length,
    missing: missing.slice(0, 30),
    qualityIssues: qualityIssues.slice(0, 30),
    unchangedReview: unchanged.slice(0, 30),
  };
  console.log(JSON.stringify(result, null, 2));

  if (missing.length || qualityIssues.length) process.exit(1);
}

main();
