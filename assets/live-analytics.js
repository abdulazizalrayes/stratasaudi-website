(function () {
  var storageKey = "strata_live_session_id";
  var sessionId = "";
  var bootstrapKey = "__strata_live_analytics_bootstrapped__";
  var gaConfiguredKey = "__strata_live_ga_configured__";
  var measurementId = "G-B0GCPQNGYX";
  var initialPageEventSent = false;

  if (window[bootstrapKey]) return;
  window[bootstrapKey] = true;

  function ensureTrackingGlobals() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== "function") {
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
    }
  }

  function isDebugMode() {
    try {
      var search = new URLSearchParams(window.location.search || "");
      return search.get("strata_debug") === "1";
    } catch (_error) {
      return false;
    }
  }

  ensureTrackingGlobals();

  function ensureGoogleAnalytics() {
    ensureTrackingGlobals();
    if (window[gaConfiguredKey]) return;

    var existingLoader = document.querySelector('script[src*="gtag/js?id=' + measurementId + '"]');
    if (!existingLoader) {
      var loader = document.createElement("script");
      loader.async = true;
      loader.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
      document.head.appendChild(loader);
    }

    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      send_page_view: true,
    });
    window[gaConfiguredKey] = true;
  }

  ensureGoogleAnalytics();

  function getSessionId() {
    if (sessionId) return sessionId;
    try {
      sessionId = window.sessionStorage.getItem(storageKey) || "";
      if (!sessionId) {
        sessionId = "sls_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
        window.sessionStorage.setItem(storageKey, sessionId);
      }
    } catch (_error) {
      sessionId = "sls_" + Date.now().toString(36);
    }
    return sessionId;
  }

  function textFor(element) {
    return (element && element.textContent ? element.textContent : "").replace(/\s+/g, " ").trim();
  }

  function pageContext() {
    return {
      page_path: window.location.pathname,
      page_title: document.title,
      page_location: window.location.href,
      page_referrer: document.referrer || "",
      session_id: getSessionId(),
    };
  }

  function pushEvent(name, payload) {
    var body = Object.assign({ event: name }, pageContext(), payload || {});
    ensureTrackingGlobals();
    window.dataLayer.push(body);

    var gaBody = Object.assign({}, body);
    delete gaBody.event;
    if (isDebugMode()) gaBody.debug_mode = true;
    window.gtag("event", name, gaBody);
  }

  function classifyLink(link) {
    var href = link.getAttribute("href") || "";
    var label = textFor(link);

    if (href.indexOf("mailto:") === 0) {
      return {
        eventName: "contact_click",
        payload: {
          contact_method: "email",
          destination: href,
          cta_label: label || "email_link",
        },
      };
    }

    if (href === "#contact" || href === "/#contact") {
      return {
        eventName: "consultation_intent",
        payload: {
          destination: href,
          cta_label: label || "contact_anchor",
        },
      };
    }

    if (link.classList.contains("hero-cta") || link.classList.contains("cta-button") || link.classList.contains("nav-contact-btn")) {
      return {
        eventName: "cta_click",
        payload: {
          destination: href,
          cta_label: label || "primary_cta",
        },
      };
    }

    if (link.classList.contains("read-more") && href && href !== "#") {
      return {
        eventName: "insight_click",
        payload: {
          destination: href,
          cta_label: label || "read_more",
        },
      };
    }

    return null;
  }

  document.addEventListener("click", function (event) {
    var link = event.target && event.target.closest ? event.target.closest("a") : null;
    if (!link) return;

    var tracked = classifyLink(link);
    if (!tracked) return;
    pushEvent(tracked.eventName, tracked.payload);
  });

  function sendInitialPageEvent() {
    if (initialPageEventSent) return;
    initialPageEventSent = true;
    pushEvent("page_view_custom", {
      page_variant: "approved_live_site",
      site_context: "strata_live_public_site",
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      sendInitialPageEvent();
      pushEvent("strata_page_context_ready");
    }, { once: true });
  } else {
    sendInitialPageEvent();
    pushEvent("strata_page_context_ready");
  }

  window.StrataLiveTracking = {
    pushEvent: pushEvent,
  };
})();
