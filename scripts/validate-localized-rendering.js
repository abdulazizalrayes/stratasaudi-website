#!/usr/bin/env node

const assert = require("assert");
const { parse } = require("node-html-parser");

const { translateText, isTranslatable } = require("../lib/i18n-renderer");
const { metadataForRoute } = require("../lib/page-metadata");
const {
  PAGE_SEO_ROUTES,
  SITE_ORIGIN,
  SUPPORTED_LANGUAGES,
  publicPathForRoute,
  publicUrlForRoute,
  readHtmlForPath,
} = require("../lib/page-renderer");

const SKIPPED_ELEMENTS = new Set(["script", "style", "noscript", "svg", "canvas", "code", "pre"]);

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function collectTextNodes(node, skipped = false, values = []) {
  const tagName = String(node.rawTagName || "").toLowerCase();
  const shouldSkip = skipped || SKIPPED_ELEMENTS.has(tagName);
  if (node.nodeType === 3 && !shouldSkip && isTranslatable(node.text)) {
    values.push(normalize(node.text));
    return values;
  }
  for (const child of node.childNodes || []) collectTextNodes(child, shouldSkip, values);
  return values;
}

function metaContent(root, selector) {
  const node = root.querySelector(selector);
  return node ? normalize(node.getAttribute("content")) : "";
}

let checked = 0;

for (const page of PAGE_SEO_ROUTES) {
  const englishRoot = parse(readHtmlForPath(page.path));
  const englishText = collectTextNodes(englishRoot.querySelector("body"));

  for (const language of SUPPORTED_LANGUAGES.filter((item) => item.code !== "en")) {
    const localizedPath = publicPathForRoute(page.path, language.code);
    const localizedRoot = parse(readHtmlForPath(localizedPath));
    const localizedText = collectTextNodes(localizedRoot.querySelector("body"));
    const metadata = metadataForRoute(page.path, language.code);
    const label = `${language.code}:${page.path}`;

    assert.strictEqual(localizedText.length, englishText.length, `${label}: text-node structure changed`);
    englishText.forEach((source, index) => {
      assert.strictEqual(
        localizedText[index],
        translateText(source, language.code),
        `${label}: untranslated or mismatched text node: ${source}`,
      );
    });

    const htmlNode = localizedRoot.querySelector("html");
    assert.strictEqual(htmlNode.getAttribute("lang"), language.code, `${label}: html lang mismatch`);
    assert.strictEqual(htmlNode.getAttribute("dir"), language.dir, `${label}: html dir mismatch`);
    assert.strictEqual(normalize(localizedRoot.querySelector("title").text), metadata.title, `${label}: title mismatch`);
    assert.strictEqual(metaContent(localizedRoot, 'meta[name="description"]'), metadata.description, `${label}: description mismatch`);
    assert.strictEqual(
      localizedRoot.querySelector('link[rel="canonical"]').getAttribute("href"),
      publicUrlForRoute(page.path, language.code),
      `${label}: canonical mismatch`,
    );
    assert(!readHtmlForPath(localizedPath).includes('content="noindex, follow"'), `${label}: noindex remains`);

    for (const anchor of localizedRoot.querySelectorAll("body a[href]")) {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:|https?:\/\/)/i.test(href)) continue;
      if (href.startsWith("/assets/") || href.startsWith("/api/")) continue;
      const pathname = new URL(href, SITE_ORIGIN).pathname;
      const isPageLink = PAGE_SEO_ROUTES.some((candidate) =>
        pathname === publicPathForRoute(candidate.path, language.code),
      );
      assert(isPageLink, `${label}: internal page link lost language context: ${href}`);
    }
    checked += 1;
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      localizedPagesChecked: checked,
      languages: SUPPORTED_LANGUAGES.filter((item) => item.code !== "en").map((item) => item.code),
    },
    null,
    2,
  ),
);
