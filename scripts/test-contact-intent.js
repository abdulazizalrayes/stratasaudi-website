const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Readable } = require("node:stream");
const { createRequire } = require("node:module");
const { classifyContactIntent } = require("../lib/contact-intent");

const offers = [
  "Are you seeking German customers? We can boost Q4 sales.",
  "Looking for a PVC window partner? Contact our sales team.",
  "We offer SEO and backlinks to grow your business.",
  "هل تبحث عن عملاء جدد؟ نقدم لكم خدمات زيادة المبيعات",
];
const enquiries = [
  "We need advice on a supplier contract for PVC windows.",
  "Looking for a risk assessment of our window partner.",
  "Our German customers have a FIDIC delay claim.",
  "We offer construction services and need contract advice.",
  "نحتاج استشارة بشأن عقد توريد نوافذ للمشروع",
  "لدينا مطالبة تأخير ونحتاج إلى مراجعة مخاطر العقد",
  "Please call me about a confidential matter.",
  "Bonjour, nous souhaitons discuter de notre projet.",
  "Guten Tag, wir suchen Beratung zu unserem Bauprojekt.",
  "Necesitamos ayuda con nuestro proyecto.",
  "Vorremmo discutere del nostro progetto.",
  "We need an introduction.",
];
offers.forEach((text) => assert.equal(classifyContactIntent(text), "suspected_solicitation"));
enquiries.forEach((text) => assert.equal(classifyContactIntent(text), "pending_review"));

async function run(message, failQuarantine = false, failMail = false) {
  const file = path.resolve(__dirname, "../api/lead-intake.js");
  const calls = { mail: 0, quarantine: 0, events: [] };
  const context = vm.createContext({
    require: createRequire(file), module: { exports: {} }, Buffer, URL, Date,
    console: { warn() {}, error() {} },
    process: { env: { GA_MEASUREMENT_ID: "test", GA_API_SECRET: "synthetic" } },
    fetch: async (_url, options) => { calls.events.push(JSON.parse(options.body)); return { ok: true }; },
    setTimeout, clearTimeout, calls, failQuarantine, failMail,
  });
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  vm.runInContext(`
    sendLeadEmail = async () => { calls.mail++; if (failMail) throw new Error("synthetic SMTP failure"); };
    quarantineSolicitation = async () => { calls.quarantine++; if (failQuarantine) throw new Error("synthetic IMAP failure"); };
  `, context);
  const payload = {
    name: "Synthetic", email: "test@example.com", company: "Synthetic company",
    country: "Saudi Arabia", mandateType: "pre_contract_risk_review", counterpartyType: "epc",
    urgency: "immediate", conflictCheckAcknowledged: true, message,
  };
  const req = Readable.from([JSON.stringify(payload)]);
  req.method = "POST";
  req.headers = { "content-type": "application/json", host: "www.stratasaudi.com", origin: "https://www.stratasaudi.com" };
  const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await context.module.exports(req, res);
  return { calls, res };
}

(async () => {
  const file = path.resolve(__dirname, "../api/lead-intake.js");
  let appended = null;
  let loggedOut = false;
  const quarantineContext = vm.createContext({
    require(name) {
      if (name === "imapflow") return { ImapFlow: class {
        async connect() {}
        async list() { return [{ path: "Junk", specialUse: "\\Junk" }]; }
        async append(folder, message, flags) { appended = { folder, message, flags }; return { uid: 1 }; }
        async logout() { loggedOut = true; }
      } };
      if (name === "../lib/private-email-client") return {
        APPROVED_BUSINESS_MAILBOX: "advisory@stratasaudi.com",
        mailboxConfig: () => ({ imap: {} }),
      };
      return createRequire(file)(name);
    }, module: { exports: {} }, Buffer, URL, Date, console, process: { env: {} },
  });
  vm.runInContext(fs.readFileSync(file, "utf8"), quarantineContext);
  await vm.runInContext('quarantineSolicitation({email:"test@example.com",company:"Synthetic",message:"Synthetic offer",leadScore:0,qualificationStatus:"suspected_solicitation"})', quarantineContext);
  assert.equal(appended.folder, "Junk");
  assert(appended.flags.includes("$Junk"));
  assert(appended.message.includes("Qualification status: suspected_solicitation"));
  assert(loggedOut);
  const spam = await run(offers[0]);
  assert.equal(spam.res.statusCode, 200);
  assert.equal(spam.calls.quarantine, 1);
  assert.equal(spam.calls.mail, 0);
  assert.equal(spam.calls.events.length, 0);
  assert.equal(spam.res.body.leadScore, 0);
  const fallback = await run(offers[1], true);
  assert.equal(fallback.calls.mail, 1);
  assert.equal(fallback.calls.events.length, 0);
  assert.equal(fallback.res.statusCode, 200);
  const failed = await run(offers[1], true, true);
  assert.equal(failed.res.statusCode, 500);
  assert.equal(failed.calls.events.length, 0);
  for (const message of enquiries) {
    const result = await run(message);
    assert.equal(result.res.statusCode, 200);
    assert.equal(result.calls.quarantine, 0);
    assert.equal(result.calls.mail, 1);
    assert.equal(result.calls.events.length, 1);
    const event = result.calls.events[0].events[0];
    assert.equal(event.name, "lead_submission");
    assert.equal(event.params.qualification_status, "pending_review");
    assert(!JSON.stringify(event).includes(message));
  }
  console.log("Contact triage PASS: obvious offers, six-language/ambiguous client preservation, recoverable quarantine, mail fallback, failure and analytics privacy. No network or mail sent.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
