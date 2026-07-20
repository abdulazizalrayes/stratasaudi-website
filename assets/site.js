(function () {
  var pages = {
    "/": { label: "Home" },
    "/about": { label: "About" },
    "/services": { label: "Mandates" },
    "/counterparties": { label: "Counterparties" },
    "/why-saudi": { label: "Risk Landscape" },
    "/insights": { label: "Insights" },
    "/faq": { label: "FAQ" },
    "/ethics": { label: "Governance" },
    "/contact": { label: "Confidential Enquiry" },
  };

  var runtime = window.STRATA_RUNTIME_CONFIG || {};
  var currentPath = window.location.pathname.replace(/\/$/, "") || "/";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeAbsoluteUrl(value, fallback) {
    try {
      var parsed = new URL(String(value || fallback || ""), window.location.origin);
      if (parsed.protocol === "https:") return parsed.toString();
    } catch (_error) {}
    return fallback;
  }

  function safeEmail(value, fallback) {
    var next = String(value || "").trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return next;
    return fallback;
  }

  function navLink(path, label) {
    var active = currentPath === path ? ' aria-current="page"' : "";
    return '<a href="' + path + '"' + active + ">" + label + "</a>";
  }

  function injectShell() {
    var navTarget = document.querySelector("[data-site-shell='nav']");
    var footerTarget = document.querySelector("[data-site-shell='footer']");
    var year = new Date().getFullYear();
    var linkedIn = safeAbsoluteUrl(
      runtime.linkedinCompanyUrl,
      "https://www.linkedin.com/company/stratasaudi",
    );
    var contactEmail = safeEmail(runtime.contactEmail, "advisory@stratasaudi.com");

    if (navTarget) {
      navTarget.innerHTML =
        '<header class="site-header">' +
        '  <div class="site-header__inner">' +
        '    <a class="wordmark" href="/">' +
        '      <span class="wordmark__name">Strata Saudi</span>' +
        '      <span class="wordmark__tag">Engineering-led risk advisory</span>' +
        "    </a>" +
        '    <button class="menu-button" type="button" aria-label="Open navigation" data-menu-button>' +
        "      <span></span><span></span><span></span>" +
        "    </button>" +
        '    <nav class="nav" data-menu>' +
        navLink("/", "Home") +
        navLink("/services", "Mandates") +
        navLink("/counterparties", "Counterparties") +
        navLink("/why-saudi", "Risk Landscape") +
        navLink("/insights", "Insights") +
        navLink("/contact", "Confidential Enquiry") +
         '      <a class="nav-cta" href="/contact" data-cta="nav_cta">Request advisory review</a>' +
        "    </nav>" +
        "  </div>" +
        "</header>";
    }

    if (footerTarget) {
      footerTarget.innerHTML =
        '<footer class="site-footer">' +
        '  <div class="footer__inner">' +
        '    <div class="footer__column">' +
        '      <div class="wordmark">' +
        '        <span class="wordmark__name">Strata Saudi</span>' +
        '        <span class="wordmark__tag">Selective advisory for Saudi project exposure</span>' +
        "      </div>" +
        '      <p>Independent technical advisory for contract risk, project risk, dispute-readiness, and premium mandate structuring in the Kingdom of Saudi Arabia.</p>' +
        '      <p><a href="' + escapeHtml(linkedIn) + '">LinkedIn</a> | <a href="mailto:' + escapeHtml(contactEmail) + '">' + escapeHtml(contactEmail) + "</a></p>" +
        "    </div>" +
        '    <div class="footer__column"><h3>Practice</h3><ul class="footer__list">' +
        "      <li><a href=\"/services\">Mandate lines</a></li>" +
        "      <li><a href=\"/counterparties\">Target counterparties</a></li>" +
        "      <li><a href=\"/why-saudi\">Risk landscape</a></li>" +
        "    </ul></div>" +
        '    <div class="footer__column"><h3>Authority</h3><ul class="footer__list">' +
        "      <li><a href=\"/insights\">Insights hub</a></li>" +
        "      <li><a href=\"/faq\">FAQ</a></li>" +
        "      <li><a href=\"/ethics\">Governance</a></li>" +
        "    </ul></div>" +
        '    <div class="footer__column"><h3>Company</h3><ul class="footer__list">' +
        "      <li><a href=\"/about\">About</a></li>" +
        "      <li><a href=\"/privacy\">Privacy</a></li>" +
        "      <li><a href=\"/terms\">Terms</a></li>" +
        '      <li><span class="fine-print">Riyadh, Saudi Arabia<br>&copy; ' + year + " Strata Saudi</span></li>" +
        "    </ul></div>" +
        "  </div>" +
        "</footer>";
    }

    var menuButton = document.querySelector("[data-menu-button]");
    var menu = document.querySelector("[data-menu]");
    if (menuButton && menu) {
      menuButton.addEventListener("click", function () {
        menu.classList.toggle("is-open");
      });
    }
  }

  function setupReveal() {
    if (!("IntersectionObserver" in window)) return;
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      },
      { threshold: 0.16 },
    );

    document.querySelectorAll(".reveal").forEach(function (node) {
      observer.observe(node);
    });
  }

  function bindTrackedDownloads() {
    document.querySelectorAll("[data-download-label]").forEach(function (node) {
      node.addEventListener("click", function () {
        if (window.StrataTracking) {
          window.StrataTracking.pushEvent("authority_asset_click", {
            asset_label: node.getAttribute("data-download-label"),
            asset_href: node.getAttribute("href") || "",
          });
        }
      });
    });
  }

  injectShell();
  bindTrackedDownloads();
  setupReveal();
})();
