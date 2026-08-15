(function () {
  var dictionary = window.StrataI18nDictionary || {};
  var languageOrder = ["en", "ar", "fr", "es", "it", "de"];
  var languages = {
    en: { label: "English", shortLabel: "EN", dir: "ltr" },
    ar: { label: "العربية", shortLabel: "AR", dir: "rtl" },
    fr: { label: "Français", shortLabel: "FR", dir: "ltr" },
    es: { label: "Español", shortLabel: "ES", dir: "ltr" },
    it: { label: "Italiano", shortLabel: "IT", dir: "ltr" },
    de: { label: "Deutsch", shortLabel: "DE", dir: "ltr" },
  };
  var originalText = new WeakMap();
  var originalTitle = document.title;
  var textAttributes = ["placeholder", "aria-label", "title", "alt"];
  var currentLanguage = "en";

  function normalizeSource(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isTranslatable(value) {
    var source = normalizeSource(value);
    if (!source) return false;
    if (/^[\d\s.,:+/()$%-]+$/.test(source)) return false;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source)) return false;
    if (/^https?:\/\//i.test(source)) return false;
    return /[A-Za-z\u0600-\u06ff]/.test(source);
  }

  function translateText(value, lang) {
    var source = normalizeSource(value);
    if (!isTranslatable(source) || lang === "en") return source;
    return (dictionary[lang] && dictionary[lang][source]) || source;
  }

  function replacePreservingWhitespace(value, translated) {
    var prefix = String(value || "").match(/^\s*/)[0];
    var suffix = String(value || "").match(/\s*$/)[0];
    return prefix + translated + suffix;
  }

  function shouldSkipNode(node) {
    var element = node.parentElement;
    if (!element) return true;
    return !!element.closest("script, style, noscript, svg, canvas, code, pre");
  }

  function translateTextNodes(lang) {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (shouldSkipNode(node) || !isTranslatable(node.nodeValue)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (!originalText.has(node)) originalText.set(node, node.nodeValue);
      var source = originalText.get(node);
      node.nodeValue = lang === "en"
        ? source
        : replacePreservingWhitespace(source, translateText(source, lang));
    });
  }

  function translateAttributes(lang) {
    Array.prototype.forEach.call(document.querySelectorAll("*"), function (element) {
      textAttributes.forEach(function (attribute) {
        if (!element.hasAttribute(attribute)) return;
        var key = "i18nSource" + attribute.replace(/(^|-)([a-z])/g, function (_match, _dash, letter) {
          return letter.toUpperCase();
        });
        if (!element.dataset[key]) element.dataset[key] = element.getAttribute(attribute);
        var source = element.dataset[key];
        if (isTranslatable(source)) {
          element.setAttribute(attribute, lang === "en" ? source : translateText(source, lang));
        }
      });
    });
  }

  function translateHead(lang) {
    document.title = lang === "en" ? originalTitle : translateText(originalTitle, lang);
    Array.prototype.forEach.call(
      document.querySelectorAll(
        'meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[name="twitter:title"], meta[name="twitter:description"]',
      ),
      function (meta) {
        if (!meta.dataset.i18nSourceContent) {
          meta.dataset.i18nSourceContent = meta.getAttribute("content") || "";
        }
        var source = meta.dataset.i18nSourceContent;
        if (isTranslatable(source)) {
          meta.setAttribute("content", lang === "en" ? source : translateText(source, lang));
        }
      },
    );
  }

  function setLanguageMetadata(lang) {
    var config = languages[lang] || languages.en;
    document.documentElement.lang = lang;
    document.documentElement.dir = config.dir;
    document.documentElement.dataset.language = lang;
  }

  function updateUrlLanguage(lang) {
    try {
      var url = new URL(window.location.href);
      if (lang === "en") {
        url.searchParams.delete("lang");
      } else {
        url.searchParams.set("lang", lang);
      }
      window.history.replaceState(null, "", url.toString());
    } catch (_error) {}
  }

  function canonicalPath() {
    var path = window.location.pathname.replace(/\/$/, "") || "/";
    if (path !== "/" && /\.html$/i.test(path)) path = path.slice(0, -5);
    return path || "/";
  }

  function languageUrl(lang) {
    var path = canonicalPath();
    var url = new URL(path === "/" ? "/" : path, "https://www.stratasaudi.com");
    if (lang !== "en") url.searchParams.set("lang", lang);
    return url.toString();
  }

  function upsertHeadLink(rel, attributes) {
    var selector = 'link[rel="' + rel + '"]';
    if (attributes.hreflang) selector += '[hreflang="' + attributes.hreflang + '"]';
    var link = document.querySelector(selector);
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", rel);
      document.head.appendChild(link);
    }
    Object.keys(attributes).forEach(function (key) {
      link.setAttribute(key, attributes[key]);
    });
  }

  function updateSeoLinks(lang) {
    upsertHeadLink("canonical", { href: languageUrl("en") });
    upsertHeadLink("alternate", { hreflang: "en", href: languageUrl("en") });
    upsertHeadLink("alternate", { hreflang: "x-default", href: languageUrl("en") });

    var ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", languageUrl("en"));
  }

  function updateSwitcherState(lang) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-language-option]"), function (button) {
      var active = button.getAttribute("data-language-option") === lang;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function applyLanguage(lang, options) {
    var next = languages[lang] ? lang : "en";
    currentLanguage = next;
    setLanguageMetadata(next);
    translateHead(next);
    translateTextNodes(next);
    translateAttributes(next);
    updateSwitcherState(next);
    updateSeoLinks(next);
    if (!options || options.persist !== false) {
      try {
        window.localStorage.setItem("strata.language", next);
      } catch (_error) {}
      updateUrlLanguage(next);
    }
  }

  function requestedLanguage() {
    try {
      var params = new URLSearchParams(window.location.search);
      var fromUrl = params.get("lang");
      if (languages[fromUrl]) return fromUrl;
    } catch (_error) {}
    try {
      var saved = window.localStorage.getItem("strata.language");
      if (languages[saved]) return saved;
    } catch (_error) {}
    return "en";
  }

  function languageButton(lang) {
    var config = languages[lang];
    return (
      '<button type="button" class="language-switcher__option" data-language-option="' +
      lang +
      '" aria-label="' +
      config.label +
      '" aria-pressed="false">' +
      config.shortLabel +
      "</button>"
    );
  }

  function pageContext() {
    return {
      page_location: window.location.href,
      page_path: window.location.pathname,
      page_title: document.title,
    };
  }

  function trackLanguageSelection(lang, previousLanguage) {
    var config = languages[lang] || languages.en;
    var payload = Object.assign(pageContext(), {
      language_code: lang,
      language_label: config.label,
      language_direction: config.dir,
      previous_language: previousLanguage || "en",
      available_languages: languageOrder.join(","),
    });

    if (window.StrataTracking && typeof window.StrataTracking.pushEvent === "function") {
      window.StrataTracking.pushEvent("language_select", payload);
      return;
    }

    if (typeof window.gtag === "function") {
      window.gtag("event", "language_select", payload);
    }
  }

  function buildSwitcher() {
    var options = languageOrder.map(languageButton).join("");
    return (
      '<div class="language-switcher" data-language-switcher aria-label="Language selector">' +
      '  <span class="language-switcher__icon" aria-hidden="true">' +
      '    <svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.25 2.45 3.38 5.45 3.38 9S14.25 18.55 12 21M12 3C9.75 5.45 8.62 8.45 8.62 12S9.75 18.55 12 21"></path></svg>' +
      "  </span>" +
      options +
      "</div>"
    );
  }

  function injectStyles() {
    if (document.getElementById("strata-i18n-styles")) return;
    var style = document.createElement("style");
    style.id = "strata-i18n-styles";
    style.textContent =
      ".language-switcher{display:inline-flex;align-items:center;gap:4px;padding:4px;border:1px solid rgba(22,18,15,.12);border-radius:999px;background:rgba(255,255,255,.72);white-space:nowrap;direction:ltr}" +
      ".language-switcher__icon{display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;color:currentColor;opacity:.72}" +
      ".language-switcher__icon svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.7}" +
      ".language-switcher__option{border:0;background:transparent;color:inherit;border-radius:999px;min-width:32px;height:28px;padding:0 8px;font-size:11px;font-weight:700;letter-spacing:.04em;cursor:pointer}" +
      ".language-switcher__option.is-active{background:#16120f;color:#fff}" +
      "nav#navbar .nav-inner{max-width:min(1360px,100%);gap:1.25rem}" +
      "nav#navbar .logo{white-space:nowrap;flex:0 0 auto}" +
      ".nav .language-switcher{margin-left:4px}" +
      ".nav-links{min-width:0;flex:1;flex-wrap:nowrap;justify-content:flex-end;column-gap:1rem;row-gap:.75rem}" +
      "nav#navbar .nav-links a{margin-left:0;white-space:nowrap}" +
      "nav#navbar .nav-contact-btn{margin-left:0!important;flex:0 0 auto}" +
      ".nav-links .language-switcher{margin-left:0;flex:0 0 auto}" +
      "html[dir='rtl'] body{text-align:right}" +
      "html[dir='rtl'] .nav,html[dir='rtl'] .nav-links,html[dir='rtl'] .quick-contact-bar,html[dir='rtl'] .contact-bar{direction:rtl}" +
      "html[dir='rtl'] th,html[dir='rtl'] td{text-align:right}" +
      "@media(max-width:1180px) and (min-width:901px){nav#navbar .nav-links{display:none}nav#navbar .hamburger{display:flex}nav#navbar .nav-links.open{display:flex;flex-direction:column;position:absolute;top:72px;left:0;right:0;background:#fff;border-bottom:1px solid rgba(22,18,15,.12);padding:2rem;gap:1.25rem;align-items:flex-start}nav#navbar .nav-links.open .language-switcher{margin-left:0;align-self:flex-start}}" +
      "@media(max-width:900px){.nav-links .language-switcher{margin-left:0;align-self:flex-start}}" +
      "@media(max-width:820px){.nav .language-switcher{margin:2px 0}.language-switcher{align-self:flex-start}}";
    document.head.appendChild(style);
  }

  function injectSwitcher() {
    if (document.querySelector("[data-language-switcher]")) return;
    var target = document.querySelector(".nav .nav-cta") || document.querySelector(".nav-links .nav-contact-btn");
    if (target) {
      target.insertAdjacentHTML("beforebegin", buildSwitcher());
      return;
    }
    var nav = document.querySelector(".nav") || document.querySelector(".nav-links");
    if (nav) nav.insertAdjacentHTML("beforeend", buildSwitcher());
  }

  function bindSwitcher() {
    document.addEventListener("click", function (event) {
      var button = event.target.closest("[data-language-option]");
      if (!button) return;
      var next = button.getAttribute("data-language-option");
      var previous = currentLanguage;
      applyLanguage(next);
      if (next !== previous) trackLanguageSelection(next, previous);
    });
  }

  function init() {
    injectStyles();
    injectSwitcher();
    bindSwitcher();
    applyLanguage(requestedLanguage(), { persist: false });
  }

  window.StrataI18n = {
    applyLanguage: applyLanguage,
    currentLanguage: function () {
      return currentLanguage;
    },
    translateText: function (value) {
      return translateText(value, currentLanguage);
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
