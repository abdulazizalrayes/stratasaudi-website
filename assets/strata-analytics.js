(function () {
  var runtime = window.STRATA_RUNTIME_CONFIG || {};
  var dataLayer = (window.dataLayer = window.dataLayer || []);
  var SESSION_KEY = "strata_session_id";
  var FIRST_TOUCH_KEY = "strata_first_touch";
  var LATEST_TOUCH_KEY = "strata_latest_touch";
  var PAGE_VIEW_KEY = "strata_page_view_sent";
  var PENDING_EVENTS_KEY = "strata_pending_events";
  var PENDING_EVENT_MAX_AGE_MS = 15 * 60 * 1000;

  function storage(type) {
    try {
      return window[type];
    } catch (_error) {
      return null;
    }
  }

  function readJson(area, key) {
    if (!area) return null;
    try {
      var value = area.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (_error) {
      return null;
    }
  }

  function writeJson(area, key, value) {
    if (!area) return;
    try {
      area.setItem(key, JSON.stringify(value));
    } catch (_error) {}
  }

  function safeUrl(value) {
    try {
      return new URL(value, window.location.href);
    } catch (_error) {
      return null;
    }
  }

  function referrerDetails(referrer) {
    var parsed = safeUrl(referrer);
    if (!parsed) return { isExternal: false, host: "" };
    return {
      isExternal: parsed.origin !== window.location.origin,
      host: parsed.hostname || "",
    };
  }

  function getSessionId() {
    var session = storage("sessionStorage");
    if (!session) return "";
    var existing = session.getItem(SESSION_KEY);
    if (existing) return existing;
    var next = "st_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    session.setItem(SESSION_KEY, next);
    return next;
  }

  function createTouchpoint(fields) {
    return {
      source: fields.source || "",
      medium: fields.medium || "",
      campaign: fields.campaign || "",
      content: fields.content || "",
      term: fields.term || "",
      referrer: fields.referrer || "",
      landing_page: window.location.href,
      captured_at: new Date().toISOString(),
    };
  }

  function touchpoint() {
    var search = new URLSearchParams(window.location.search || "");
    var source = search.get("utm_source") || "";
    var medium = search.get("utm_medium") || "";
    var campaign = search.get("utm_campaign") || "";
    var content = search.get("utm_content") || "";
    var term = search.get("utm_term") || "";
    var referrer = document.referrer || "";
    var referrerInfo = referrerDetails(referrer);
    var hasMarketingSignal = source || medium || campaign || content || term;

    if (!(hasMarketingSignal || referrerInfo.isExternal)) return null;

    return createTouchpoint({
      source: source || referrerInfo.host || "",
      medium: medium || (referrerInfo.isExternal ? "referral" : ""),
      campaign: campaign,
      content: content,
      term: term,
      referrer: referrer,
    });
  }

  function directTouchpoint() {
    return createTouchpoint({
      source: "direct",
      medium: "none",
      campaign: "",
      content: "",
      term: "",
      referrer: "",
    });
  }

  function attribution() {
    var local = storage("localStorage");
    var first = readJson(local, FIRST_TOUCH_KEY);
    var latest = readJson(local, LATEST_TOUCH_KEY);
    var current = touchpoint();
    if (current) {
      if (!first) {
        first = current;
        writeJson(local, FIRST_TOUCH_KEY, current);
      }
      latest = current;
      writeJson(local, LATEST_TOUCH_KEY, current);
    }

    if (!first) {
      first = directTouchpoint();
      writeJson(local, FIRST_TOUCH_KEY, first);
    }

    if (!latest) {
      latest = first;
      writeJson(local, LATEST_TOUCH_KEY, latest);
    }

    return {
      session_id: getSessionId(),
      first_touch: first,
      latest_touch: latest,
    };
  }

  function buildBase() {
    var touch = attribution();
    return {
      page_location: window.location.href,
      page_path: window.location.pathname,
      page_title: document.title,
      page_referrer: document.referrer || "",
      session_id: touch.session_id || "",
      first_touch_source: touch.first_touch && touch.first_touch.source ? touch.first_touch.source : "",
      first_touch_medium: touch.first_touch && touch.first_touch.medium ? touch.first_touch.medium : "",
      first_touch_campaign: touch.first_touch && touch.first_touch.campaign ? touch.first_touch.campaign : "",
      latest_touch_source: touch.latest_touch && touch.latest_touch.source ? touch.latest_touch.source : "",
      latest_touch_medium: touch.latest_touch && touch.latest_touch.medium ? touch.latest_touch.medium : "",
      latest_touch_campaign: touch.latest_touch && touch.latest_touch.campaign ? touch.latest_touch.campaign : "",
    };
  }

  function initGa() {
    if (!runtime.gaMeasurementId) return;
    if (!document.querySelector("[data-strata-ga='true']")) {
      var script = document.createElement("script");
      script.async = true;
      script.dataset.strataGa = "true";
      script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(runtime.gaMeasurementId);
      document.head.appendChild(script);
    }

    window.gtag = window.gtag || function () { dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", runtime.gaMeasurementId, {
      debug_mode: runtime.gaDebugMode === true,
      anonymize_ip: true,
      send_page_view: false,
    });
  }

  function queuePendingEvent(name, payload) {
    var session = storage("sessionStorage");
    var existing = readJson(session, PENDING_EVENTS_KEY);

    if (!session) return false;
    if (!Array.isArray(existing)) existing = [];

    existing.push({
      name: name,
      payload: payload || {},
      created_at: Date.now(),
    });
    writeJson(session, PENDING_EVENTS_KEY, existing);
    return true;
  }

  function pushEvent(name, payload) {
    var body = Object.assign({ event: name }, buildBase(), payload || {});
    if (typeof window.gtag === "function" && runtime.gaMeasurementId) {
      var gtagBody = Object.assign({}, body);
      delete gtagBody.event;
      window.gtag("event", name, gtagBody);
    }
  }

  function flushPendingEvents() {
    var session = storage("sessionStorage");
    var pending = readJson(session, PENDING_EVENTS_KEY);

    if (!session || !Array.isArray(pending) || pending.length === 0) return;

    session.removeItem(PENDING_EVENTS_KEY);
    pending.forEach(function (item) {
      if (!item || !item.name) return;
      if (item.created_at && Date.now() - Number(item.created_at) > PENDING_EVENT_MAX_AGE_MS) return;
      pushEvent(item.name, item.payload || {});
    });
  }

  function markPageView() {
    var session = storage("sessionStorage");
    var key = PAGE_VIEW_KEY + ":" + window.location.pathname;
    if (session && session.getItem(key)) return;
    if (session) session.setItem(key, "1");
    pushEvent("page_view_custom", {
      page_template: document.body.getAttribute("data-page-template") || "default",
    });
  }

  function bindClicks() {
    document.addEventListener("click", function (event) {
      var link = event.target.closest("a, button");
      if (!link) return;
      var href = link.getAttribute("href") || "";
      var label = (link.textContent || "").trim();

      if (/^mailto:/.test(href)) {
        pushEvent("contact_click", {
          contact_method: "email",
          contact_destination: href.replace(/^mailto:/, ""),
          contact_label: label,
        });
      }

      if (link.hasAttribute("data-cta")) {
        pushEvent("cta_click", {
          cta_label: label,
          cta_variant: link.getAttribute("data-cta"),
          cta_href: href,
        });
      }
    });
  }

  initGa();
  bindClicks();
  markPageView();
  flushPendingEvents();

  window.StrataTracking = {
    attribution: attribution,
    pushEvent: pushEvent,
    queuePendingEvent: queuePendingEvent,
  };
})();
