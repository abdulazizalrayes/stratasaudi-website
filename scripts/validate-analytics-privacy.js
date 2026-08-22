#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const htmlFiles = fs.readdirSync(path.join(ROOT, "site")).filter((file) => file.endsWith(".html"));
for (const file of htmlFiles) {
  const html = read(`site/${file}`);
  assert(!html.includes("GTM-"), `${file}: embedded GTM remains`);
  assert(!html.toLowerCase().includes("mixpanel"), `${file}: Mixpanel remains`);
  assert(!html.includes("/assets/live-analytics.js"), `${file}: legacy analytics loader remains`);
  assert(html.includes('/api/client-config.js'), `${file}: first-party runtime config is missing`);
  assert(html.includes('/assets/strata-analytics.js'), `${file}: consolidated analytics loader is missing`);
}

const contact = read("site/contact.html");
for (const forbidden of ["field_value", "form_field_focus", "form_field_input", "form_field_blur"]) {
  assert(!contact.includes(forbidden), `contact.html: privacy-unsafe field analytics remains (${forbidden})`);
}
assert(contact.includes('pushEvent("form_start"'), "contact.html: privacy-safe form-start event missing");
assert(contact.includes('queuePendingEvent("form_submit_success"'), "contact.html: submission diagnostic event missing");

const analytics = read("assets/strata-analytics.js");
assert(!analytics.includes("initGtm"), "strata-analytics.js: GTM initialization remains");
assert(!analytics.includes("runtime.gtmId"), "strata-analytics.js: GTM runtime configuration remains");
assert(!analytics.toLowerCase().includes("mixpanel"), "strata-analytics.js: Mixpanel reference remains");
assert(analytics.includes("allow_google_signals: false"), "strata-analytics.js: Google advertising signals must be disabled");
assert(analytics.includes("allow_ad_personalization_signals: false"), "strata-analytics.js: ad personalization signals must be disabled");
assert(analytics.includes('ad_storage: "denied"'), "strata-analytics.js: advertising storage must default to denied");
assert(analytics.includes('ad_user_data: "denied"'), "strata-analytics.js: advertising user data must default to denied");
assert(analytics.includes('ad_personalization: "denied"'), "strata-analytics.js: advertising personalization must default to denied");
assert(analytics.includes('ads_data_redaction", true'), "strata-analytics.js: advertising data redaction must be enabled");
assert(analytics.includes('contact_method: "phone"'), "strata-analytics.js: phone click measurement missing");
assert(analytics.includes('contact_method: "whatsapp"'), "strata-analytics.js: WhatsApp click measurement missing");
assert(analytics.includes('pushEvent("whatsapp_click"'), "strata-analytics.js: dedicated WhatsApp click event missing");
assert(analytics.includes('click_source: "strata_saudi_website"'), "strata-analytics.js: Strata click source marker missing");
assert(!analytics.includes("contactUrl.search"), "strata-analytics.js: WhatsApp prefill must not enter analytics");

const runtimeConfig = read("api/runtime-config.js");
assert(!runtimeConfig.includes("gtmId"), "runtime-config.js: public GTM id remains");
assert(!runtimeConfig.includes("process.env.GTM_ID"), "runtime-config.js: GTM environment binding remains");
assert(runtimeConfig.includes('const approvedMobile = "+966500067865"'), "runtime-config.js: approved mobile missing");
assert(runtimeConfig.includes("Strata%20Saudi%20website"), "runtime-config.js: source-identifying WhatsApp link missing");

const intake = read("api/lead-intake.js");
const mailPosition = intake.lastIndexOf("await sendLeadEmail(payload)");
const analyticsPosition = intake.lastIndexOf("sendGa4MeasurementProtocolEvent(payload)");
assert(mailPosition >= 0, "lead-intake.js: confirmed email delivery call missing");
assert(analyticsPosition > mailPosition, "lead-intake.js: lead_submission must occur only after email delivery succeeds");
assert(intake.includes('name: "lead_submission"'), "lead-intake.js: server-confirmed lead event missing");
assert(!intake.includes("country: payload.country"), "lead-intake.js: free-text country must not enter GA4");
assert(!intake.includes("term: (payload.firstTouch"), "lead-intake.js: free-text UTM term must not enter GA4");

assert(!fs.existsSync(path.join(ROOT, "assets", "live-analytics.js")), "legacy analytics file still exists");

console.log(JSON.stringify({
  ok: true,
  htmlFilesChecked: htmlFiles.length,
  browserAnalytics: "direct_ga4_only",
  keyEventCandidate: "lead_submission",
  formFieldValuesCollected: false,
}, null, 2));
