#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("node-html-parser");
const { PAGE_SEO_ROUTES, SUPPORTED_LANGUAGES, SITE_ORIGIN, publicPathForRoute, readHtmlForPath } = require("../lib/page-renderer");
const { readDictionary } = require("../lib/i18n-renderer");

const resources = ["/about", "/counterparties", "/why-saudi", "/faq", "/ethics", "/mandate-checklist", "/privacy", "/terms"];
const core = ["/", "/services", "/insights", "/fidic-claims-saudi-arabia"];
const dictionary = readDictionary();
const quantumKeys = ["Loss and expense quantum modeling", "Quantum calculation and documentation packaging"];
const physicsTerms = /quantique|cuántic|quantistic|Quanten|حساب الكم|نمذجة الكم/iu;
for (const code of ["ar", "fr", "es", "it", "de"]) {
  for (const key of quantumKeys) {
    assert(dictionary[code][key] && !physicsTerms.test(dictionary[code][key]), `${code}: financial quantum mistranslated`);
  }
  const values = Object.values(dictionary[code]).join("\n");
  assert(!/الطب الشرعي|متخصصي الكم|spécialistes quantiques|especialistas cuánticos|specialisti quantistici|Quantenspezialisten/.test(values), `${code}: advisory terminology regression`);
  assert(!/concurrence|concorrenza/.test(dictionary[code]["Concurrency evaluation"]), `${code}: concurrent delays must not mean competition`);
}
const servicesSource = fs.readFileSync(path.join(__dirname, "../site/services.html"), "utf8");
assert(!/content:\s*["']&(?:rarr|larr);/.test(servicesSource), "CSS must use Unicode escapes, not HTML entities");
assert(servicesSource.includes('content: "\\2192"') && servicesSource.includes('content: "\\2190"'), "directional service markers required");
assert(servicesSource.includes("padding-inline-start: 1.5rem") && servicesSource.includes("inset-inline-start: 0"), "service markers must respect RTL");

for (const { code } of SUPPORTED_LANGUAGES) {
  const pages = new Map();
  for (const { path: route } of PAGE_SEO_ROUTES) {
    const urlPath = publicPathForRoute(route, code);
    const document = parse(readHtmlForPath(urlPath));
    const links = document.querySelectorAll("a[href]").flatMap((anchor) => {
      const url = new URL(anchor.getAttribute("href"), SITE_ORIGIN + urlPath);
      return url.origin === SITE_ORIGIN ? [url.pathname] : [];
    });
    pages.set(urlPath, links);
    if (core.includes(route)) {
      const nav = document.querySelectorAll("nav.footer-resources");
      assert.equal(nav.length, 1, `${urlPath}: exactly one visible resource navigation`);
      for (const target of resources) {
        assert(nav[0].querySelector(`a[href="${publicPathForRoute(target, code)}"]`), `${urlPath}: missing ${target}`);
      }
      const label = code === "en" ? "Resources" : dictionary[code].Resources;
      assert.equal(nav[0].getAttribute("aria-label"), label);
    }
    if (["/about", "/ethics"].includes(route)) {
      assert(!/Paperclip|OpenCode|Codex|Claude Code|premium adapters|GTM|RevOps/i.test(document.text), `${urlPath}: internal operations copy leaked`);
      assert.equal(document.querySelectorAll("article.card").length, route === "/about" ? 2 : 4, `${urlPath}: card layout changed`);
      if (route === "/about") assert.equal(document.querySelectorAll("article.metric").length, 3);
    }
  }
  const start = publicPathForRoute("/", code);
  const reachable = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const target of pages.get(queue.shift()) || []) {
      if (pages.has(target) && !reachable.has(target)) {
        reachable.add(target);
        queue.push(target);
      }
    }
  }
  assert.equal(reachable.size, pages.size, `${code}: every sitemap page must be reachable without JavaScript`);
}

const source = fs.readFileSync(path.join(__dirname, "../assets/i18n-dictionary.js"), "utf8");
assert(!/Paperclip|OpenCode|Codex|Claude Code|premium adapters|browser governance|agent controls/.test(source), "retired internal translations remain public");
console.log("Public navigation: all 78 pages reachable from their language homepage; localized links and client-facing copy PASS");
