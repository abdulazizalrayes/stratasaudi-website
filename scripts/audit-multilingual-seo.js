#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  PAGE_SEO_ROUTES,
  SITE_ORIGIN,
  SUPPORTED_LANGUAGES,
  publicUrlForRoute,
  readHtmlForPath,
} = require("../lib/page-renderer");

const ROOT = path.join(__dirname, "..");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function countMatches(pattern, value) {
  return [...String(value || "").matchAll(pattern)].length;
}

for (const page of PAGE_SEO_ROUTES) {
  for (const language of SUPPORTED_LANGUAGES) {
    const route = language.code === "en" ? page.path : `${page.path}?lang=${language.code}`;
    const html = readHtmlForPath(route);
    const expectedCanonical = publicUrlForRoute(page.path, "en");

    expect(!!html, `${route}: rendered HTML missing`);
    expect(html.includes(`<link rel="canonical" href="${expectedCanonical}">`), `${route}: canonical mismatch`);
    expect(html.includes(`lang="${language.code}"`), `${route}: html lang missing`);
    expect(html.includes(`dir="${language.dir}"`), `${route}: html dir missing`);
    expect(!html.includes("https://stratasaudi.com"), `${route}: bare domain remains`);
    expect(countMatches(/rel="alternate"\s+hreflang="/g, html) === 2, `${route}: hreflang count mismatch`);

    expect(
      html.includes(`hreflang="en" href="${publicUrlForRoute(page.path, "en")}"`),
      `${route}: missing en alternate`,
    );
    if (language.code !== "en") {
      expect(html.includes('content="noindex, follow"'), `${route}: non-English query page should be noindex`);
    }
    expect(
      html.includes(`hreflang="x-default" href="${publicUrlForRoute(page.path, "en")}"`),
      `${route}: missing x-default alternate`,
    );
  }
}

const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
const imageSitemap = fs.readFileSync(path.join(ROOT, "image-sitemap.xml"), "utf8");
const thankYouHtml = readHtmlForPath("/thank-you");
const homeHtml = readHtmlForPath("/");
const robots = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8");
const llms = fs.readFileSync(path.join(ROOT, "llms.txt"), "utf8");
const indexNowKey = fs.readFileSync(path.join(ROOT, "0957b4b1b950a90f9ac51a5a737203ec.txt"), "utf8").trim();
const indexNowScript = fs.readFileSync(path.join(ROOT, "scripts", "submit-indexnow.js"), "utf8");
const vercelConfig = fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8");
const siteHtml = fs
  .readdirSync(path.join(ROOT, "site"))
  .filter((file) => file.endsWith(".html"))
  .map((file) => fs.readFileSync(path.join(ROOT, "site", file), "utf8"))
  .join("\n");

expect(sitemap.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'), "sitemap: xhtml namespace missing");
expect(!sitemap.includes(".html"), "sitemap: .html URL remains");
expect(!sitemap.includes("https://stratasaudi.com"), "sitemap: bare domain remains");
expect(!sitemap.includes("?lang="), "sitemap: language query URL remains");
expect(!sitemap.includes("/thank-you"), "sitemap: thank-you should not be indexable");
expect(countMatches(/<loc>/g, sitemap) === PAGE_SEO_ROUTES.length, "sitemap: URL count mismatch");
expect(!imageSitemap.includes(".html"), "image sitemap: .html URL remains");
expect(!imageSitemap.includes("https://stratasaudi.com"), "image sitemap: bare domain remains");
expect(imageSitemap.includes(`${SITE_ORIGIN}/og-image.png`), "image sitemap: canonical image URL missing");
expect(thankYouHtml.includes('content="noindex, nofollow"'), "thank-you: noindex missing");
expect(robots.includes("ai-input=yes"), "robots: ai-input=yes missing");
expect(!robots.includes("ai-input=no"), "robots: stale ai-input=no remains");
expect(llms.includes("Strata Risk Advisory"), "llms: Strata Risk Advisory missing");
expect(llms.includes("not a law firm"), "llms: law-firm disambiguation missing");
expect(llms.includes("https://www.stratasaudi.com/"), "llms: canonical website missing");
expect(indexNowScript.includes(`DEFAULT_KEY = "${indexNowKey}"`), "IndexNow: submission key differs from hosted key");
expect(vercelConfig.includes(`/${indexNowKey}.txt`), "IndexNow: Vercel route for hosted key missing");
expect(!siteHtml.includes("+966XXXXXXXXX"), "site source: literal X phone placeholder remains");
expect(!siteHtml.includes("966XXXXXXXXX"), "site source: literal WhatsApp placeholder remains");
expect(!siteHtml.includes("tel:+966500000000"), "site source: generic phone placeholder remains");
expect(!siteHtml.includes("wa.me/966500000000"), "site source: generic WhatsApp placeholder remains");
expect(!siteHtml.includes("data-contact-placeholder"), "site source: phone/WhatsApp placeholder contact links remain");
expect(!siteHtml.includes(">WhatsApp<"), "site source: WhatsApp contact label remains");
expect(homeHtml.includes('"@type": "Person"'), "schema: Person entity missing");
expect(homeHtml.includes('"@id": "https://www.stratasaudi.com/#abdulaziz-alrayes"'), "schema: founder @id missing");
expect(homeHtml.includes('"sameAs"') && homeHtml.includes("https://www.linkedin.com/company/stratasaudi"), "schema: company LinkedIn sameAs missing");
expect(homeHtml.includes('"hasOfferCatalog"'), "schema: service catalog missing");
expect(!homeHtml.includes("en_SA"), "og:locale: en_SA remains");
expect(homeHtml.includes('<meta property="og:locale" content="en_US">'), "og:locale: en_US missing");

if (failures.length) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        failures,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
      {
        ok: true,
        pagesChecked: PAGE_SEO_ROUTES.length,
        languagesChecked: SUPPORTED_LANGUAGES.map((language) => language.code),
        sitemapUrls: PAGE_SEO_ROUTES.length,
      },
    null,
    2,
  ),
);
