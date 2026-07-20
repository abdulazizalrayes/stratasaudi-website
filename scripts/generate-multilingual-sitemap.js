#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  PAGE_SEO_ROUTES,
  SITE_ORIGIN,
  SUPPORTED_LANGUAGES,
  publicUrlForRoute,
} = require("../lib/page-renderer");

const ROOT = path.join(__dirname, "..");

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function alternateLinks(pagePath) {
  const links = [
    `    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(publicUrlForRoute(pagePath, "en"))}" />`,
  ];
  links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(publicUrlForRoute(pagePath, "en"))}" />`);
  return links.join("\n");
}

function sitemapUrl(page) {
  return [
    "  <url>",
    `    <loc>${escapeXml(publicUrlForRoute(page.path, "en"))}</loc>`,
    alternateLinks(page.path),
    `    <lastmod>${page.lastmod}</lastmod>`,
    `    <changefreq>${page.changefreq}</changefreq>`,
    `    <priority>${page.priority}</priority>`,
    "  </url>",
  ].join("\n");
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
  '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  PAGE_SEO_ROUTES.map((page) => sitemapUrl(page)).join("\n"),
  "</urlset>",
  "",
].join("\n");

const imageSitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
  '  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
  ...[
    ["/", "Strata Risk Advisory"],
    ["/services", "Strata Risk Advisory Services"],
    ["/insights", "Strata Risk Advisory Insights"],
    ["/fidic-claims-saudi-arabia", "FIDIC Claims Saudi Arabia"],
  ].map(([pagePath, title]) =>
    [
      "  <url>",
      `    <loc>${escapeXml(`${SITE_ORIGIN}${pagePath === "/" ? "/" : pagePath}`)}</loc>`,
      "    <image:image>",
      `      <image:loc>${escapeXml(`${SITE_ORIGIN}/og-image.png`)}</image:loc>`,
      `      <image:title>${escapeXml(title)}</image:title>`,
      "    </image:image>",
      "  </url>",
    ].join("\n"),
  ),
  "</urlset>",
  "",
].join("\n");

fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap);
fs.writeFileSync(path.join(ROOT, "image-sitemap.xml"), imageSitemap);

console.log(
  JSON.stringify(
    {
      ok: true,
      sitemapUrls: PAGE_SEO_ROUTES.length,
      pages: PAGE_SEO_ROUTES.length,
      languages: SUPPORTED_LANGUAGES.map((language) => language.code),
    },
    null,
    2,
  ),
);
