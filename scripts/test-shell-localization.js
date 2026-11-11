const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { readDictionary } = require("../lib/i18n-renderer");

const source = fs.readFileSync(path.join(__dirname, "../assets/i18n.js"), "utf8");
const dictionary = readDictionary();
for (const language of ["en", "ar", "fr", "es", "it", "de"]) {
  const text = { nodeValue: "Home", parentElement: { closest: () => null } };
  const attributes = { href: "/contact", "aria-label": "Open navigation" };
  const link = {
    dataset: {},
    getAttribute: (key) => attributes[key],
    hasAttribute: (key) => Object.hasOwn(attributes, key),
    setAttribute: (key, value) => { attributes[key] = value; },
  };
  const shell = { querySelectorAll: () => [link] };
  const document = {
    title: "Contact", readyState: "loading",
    documentElement: { dataset: { language } },
    addEventListener: () => {},
    querySelectorAll: (selector) => selector === "[data-site-shell]" ? [shell] : [],
    createTreeWalker: (root) => {
      assert.equal(root, shell, "already-localized main content must not be rewritten");
      let visited = false;
      return { currentNode: text, nextNode: () => visited ? null : (visited = true, text) };
    },
  };
  const window = { StrataI18nDictionary: dictionary };
  vm.runInNewContext(source, { document, window, NodeFilter: { SHOW_TEXT: 4 }, URL });
  window.StrataI18n.applyLanguage(language, { initial: true });
  assert.equal(text.nodeValue, language === "en" ? "Home" : dictionary[language].Home);
  assert.equal(attributes["aria-label"], language === "en" ? "Open navigation" : dictionary[language]["Open navigation"]);
  assert.equal(attributes.href, language === "en" ? "/contact" : `/${language}/contact`);
  window.StrataI18n.applyLanguage(language, { initial: true });
  assert.equal(attributes.href, language === "en" ? "/contact" : `/${language}/contact`, "must not double-prefix links");
}
console.log("Shared-shell localization: six languages, labels, links, unchanged English and idempotence PASS");
