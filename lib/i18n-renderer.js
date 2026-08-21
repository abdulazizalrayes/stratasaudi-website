const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { parse } = require("node-html-parser");

const { PAGE_METADATA } = require("./page-metadata");

const SITE_ORIGIN = "https://www.stratasaudi.com";
const DICTIONARY_PATH = path.join(__dirname, "..", "assets", "i18n-dictionary.js");
const SKIPPED_ELEMENTS = new Set(["script", "style", "noscript", "svg", "canvas", "code", "pre"]);
const TEXT_ATTRIBUTES = ["placeholder", "aria-label", "title", "alt"];

let dictionaryCache;

function readDictionary() {
  if (dictionaryCache) return dictionaryCache;
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(DICTIONARY_PATH, "utf8"), context);
  dictionaryCache = context.window.StrataI18nDictionary || {};
  return dictionaryCache;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isTranslatable(value) {
  const source = normalizeText(value);
  if (!source) return false;
  if (/^[\d\s.,:+/()$%-]+$/.test(source)) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source)) return false;
  if (/^https?:\/\//i.test(source)) return false;
  return /[A-Za-z\u0600-\u06ff]/.test(source);
}

function translateText(value, languageCode) {
  const source = normalizeText(value);
  if (languageCode === "en" || !isTranslatable(source)) return source;
  const dictionary = readDictionary();
  return (dictionary[languageCode] && dictionary[languageCode][source]) || source;
}

function escapeText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replacePreservingWhitespace(rawValue, translated) {
  const raw = String(rawValue || "");
  const prefix = (raw.match(/^\s*/) || [""])[0];
  const suffix = (raw.match(/\s*$/) || [""])[0];
  return `${prefix}${escapeText(translated)}${suffix}`;
}

function translateTextNodes(node, languageCode, skipped = false) {
  const tagName = String(node.rawTagName || "").toLowerCase();
  const shouldSkip = skipped || SKIPPED_ELEMENTS.has(tagName);

  if (node.nodeType === 3 && !shouldSkip && isTranslatable(node.text)) {
    const translated = translateText(node.text, languageCode);
    node.rawText = replacePreservingWhitespace(node.rawText, translated);
    return;
  }

  for (const child of node.childNodes || []) {
    translateTextNodes(child, languageCode, shouldSkip);
  }
}

function translateAttributes(body, languageCode) {
  for (const element of body.querySelectorAll("*")) {
    for (const attribute of TEXT_ATTRIBUTES) {
      const source = element.getAttribute(attribute);
      if (!isTranslatable(source)) continue;
      element.setAttribute(attribute, translateText(source, languageCode));
    }
  }
}

function basePagePath(pathname) {
  let route = String(pathname || "/").replace(/\/$/, "") || "/";
  route = route.replace(/^\/(ar|fr|es|it|de)(?=\/|$)/, "") || "/";
  if (route !== "/" && route.endsWith(".html")) route = route.slice(0, -5);
  return Object.prototype.hasOwnProperty.call(PAGE_METADATA, route) ? route : null;
}

function localizeInternalLinks(body, languageCode, publicPathForRoute) {
  for (const anchor of body.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) continue;

    let url;
    try {
      url = new URL(href, SITE_ORIGIN);
    } catch (_error) {
      continue;
    }
    if (url.origin !== SITE_ORIGIN) continue;

    const pagePath = basePagePath(url.pathname);
    if (!pagePath) continue;
    url.searchParams.delete("lang");
    const localizedPath = publicPathForRoute(pagePath, languageCode);
    const localizedHref = `${localizedPath}${url.search}${url.hash}`;
    anchor.setAttribute("href", href.startsWith(SITE_ORIGIN) ? `${SITE_ORIGIN}${localizedHref}` : localizedHref);
  }
}

function renderLocalizedHtml(html, languageCode, publicPathForRoute) {
  if (languageCode === "en") return html;
  const root = parse(html, {
    comment: true,
    blockTextElements: {
      script: true,
      noscript: true,
      style: true,
      pre: true,
    },
  });
  const body = root.querySelector("body");
  if (!body) return html;

  translateTextNodes(body, languageCode);
  translateAttributes(body, languageCode);
  localizeInternalLinks(body, languageCode, publicPathForRoute);
  return root.toString();
}

module.exports = {
  basePagePath,
  isTranslatable,
  readDictionary,
  renderLocalizedHtml,
  translateText,
};
