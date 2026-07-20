#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CANONICAL_ORIGIN = "https://www.stratasaudi.com";
const REQUIRED_ROUTES = new Map([
  ["/api/contact", "/api/lead-intake.js"],
  ["/api/mcp", "/api/mcp.js"],
  ["/mcp", "/api/mcp.js"],
  ["/api/client-config.js", "/api/runtime-config.js"],
  ["/", "/api/page.js"],
  ["/services", "/api/page.js"],
  ["/insights", "/api/page.js"],
  ["/fidic-claims-saudi-arabia", "/api/page.js"],
]);
const REQUIRED_STATIC_BUILDS = [
  "llms.txt",
  "llms-full.txt",
  "openapi.json",
  "auth.md",
  "robots.txt",
  "sitemap.xml",
  "image-sitemap.xml",
  ".well-known/**/*.json",
  ".well-known/api-catalog",
  "data/**/*.json",
];
const REQUIRED_IGNORE_LINES = [
  ".vercel",
  "node_modules",
  "ops",
  "paperclip",
  "project",
  "project 2",
  "tmp",
  "logs",
];
const PUBLIC_ENV_NAMES = [
  "APP_DOMAIN",
  "PRIMARY_SITE_URL",
  "CONTACT_EMAIL",
  "GA_MEASUREMENT_ID",
  "GTM_ID",
];
const SECRET_ENV_NAMES = [
  "HUBSPOT_PRIVATE_APP_TOKEN",
  "PRIVATE_EMAIL_SMTP_PASS",
  "PRIVATE_EMAIL_IMAP_PASS",
  "SMTP_PASS",
  "GA_API_SECRET",
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function fail(message) {
  throw new Error(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function routeDestinations(vercelConfig) {
  return new Map((vercelConfig.routes || []).map((route) => [route.src, route.dest]));
}

function buildSources(vercelConfig) {
  return new Set((vercelConfig.builds || []).map((build) => build.src));
}

function main() {
  const vercelConfig = readJson("vercel.json");
  const projectConfig = readJson(".vercel/project.json");
  const vercelIgnore = readText(".vercelignore");
  const routes = routeDestinations(vercelConfig);
  const builds = buildSources(vercelConfig);

  expect(projectConfig.projectName === "stratasaudi-website", ".vercel/project.json: unexpected project name");
  expect(projectConfig.settings.rootDirectory === null, "Vercel project root should remain repository root");
  expect(projectConfig.settings.nodeVersion === "24.x", "Vercel Node version should be 24.x");
  expect(vercelConfig.name === "strata-saudi-website", "vercel.json: deployment name mismatch");
  expect(vercelConfig.version === 2, "vercel.json: version must be 2");

  for (const [source, destination] of REQUIRED_ROUTES) {
    expect(routes.get(source) === destination, `vercel.json: route ${source} must target ${destination}`);
  }
  for (const source of REQUIRED_STATIC_BUILDS) {
    expect(builds.has(source), `vercel.json: static build missing for ${source}`);
  }

  expect(!routes.has("/api/mailbox-status"), "vercel.json: mailbox-status must stay unrouted unless private ops auth is approved");
  expect(readText("robots.txt").includes(`Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`), "robots.txt: canonical sitemap missing");
  expect(readText("llms.txt").includes(`Canonical website: ${CANONICAL_ORIGIN}/`), "llms.txt: canonical URL missing");
  expect(readText("openapi.json").includes(`\"url\": \"${CANONICAL_ORIGIN}\"`), "openapi.json: canonical server missing");

  for (const line of REQUIRED_IGNORE_LINES) {
    expect(
      vercelIgnore.split(/\r?\n/).includes(line),
      `.vercelignore: ${line} should be excluded from deployments`,
    );
  }

  const envExample = readText(".env.example");
  for (const name of PUBLIC_ENV_NAMES) {
    expect(envExample.includes(`${name}=`), `.env.example: ${name} missing`);
  }
  for (const name of SECRET_ENV_NAMES) {
    expect(envExample.includes(`${name}=`), `.env.example: ${name} placeholder missing`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        message: "Vercel project validation passed.",
        projectName: projectConfig.projectName,
        canonicalOrigin: CANONICAL_ORIGIN,
        routesChecked: REQUIRED_ROUTES.size,
        staticBuildsChecked: REQUIRED_STATIC_BUILDS.length,
        mailboxStatusExposed: false,
      },
      null,
      2,
    ),
  );
}

main();
