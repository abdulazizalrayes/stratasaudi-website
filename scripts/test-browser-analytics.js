#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "../assets/strata-analytics.js"), "utf8");
function store() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
function load(sessionStorage = store(), localStorage = store(), measurementId = "G-TEST") {
  const listeners = {};
  const scripts = [];
  const window = {
    STRATA_RUNTIME_CONFIG: { gaMeasurementId: measurementId },
    location: new URL("https://www.stratasaudi.com/services"),
    sessionStorage, localStorage, crypto: webcrypto,
  };
  const document = {
    title: "Strata services", referrer: "",
    querySelector: () => scripts[0] || null,
    createElement: () => ({ dataset: {} }),
    head: { appendChild: (script) => scripts.push(script) },
    body: { getAttribute: () => "services" },
    addEventListener: (name, handler) => {
      (listeners[name] ||= []).push(handler);
    },
  };
  const context = vm.createContext({ window, document, URL, URLSearchParams, Uint32Array });
  vm.runInContext(source, context);
  const events = () => window.dataLayer.filter((entry) => entry[0] === "event");
  return { window, context, events, scripts, listeners };
}

const session = store();
const local = store();
const first = load(session, local);
assert.equal(first.events().filter((e) => e[1] === "page_view").length, 1);
assert.equal(first.events().filter((e) => e[1] === "page_view_custom").length, 0);
assert.equal(first.window.dataLayer.find((e) => e[0] === "config")[2].send_page_view, false);
assert.equal(Object.hasOwn(first.events()[0][2], "session_id"), false);
assert.match(first.window.StrataTracking.attribution().session_id, /^st_/);

vm.runInContext(source, first.context);
assert.equal(first.events().length, 1, "duplicate script must not duplicate pageviews");
assert.equal(first.scripts.length, 1);
assert.equal(first.listeners.click.length, 1);
assert.equal(load(session, local).events().length, 1, "revisit must count a new document view");

const link = {
  textContent: "WhatsApp",
  getAttribute: (name) => name === "href" ? "https://wa.me/966500067865?text=private-prefill" : null,
  hasAttribute: () => false,
};
first.listeners.click[0]({ target: { closest: () => link } });
assert.deepEqual(Array.from(first.events(), (e) => e[1]), ["page_view", "contact_click", "whatsapp_click"]);
assert.equal(JSON.stringify(first.events()).includes("private-prefill"), false);
assert.equal(first.events().some((e) => Object.hasOwn(e[2], "session_id")), false);

first.window.StrataTracking.queuePendingEvent("form_submit_success", { status: "success" });
const next = load(session, local);
assert.deepEqual(Array.from(next.events(), (e) => e[1]), ["page_view", "form_submit_success"]);
assert.equal(load(session, local).events().length, 1, "pending events flush once");
assert.equal(load(store(), store(), "").events().length, 0);
console.log("Browser analytics: pageviews, native sessions, duplicate loading, revisits, WhatsApp privacy, pending events PASS");
