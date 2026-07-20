#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT =
  process.env.STRATA_WORKSPACE_CWD ||
  path.join(__dirname, "..");

const OUTPUT_DIR = path.join(
  ROOT,
  "paperclip",
  "reports",
  "qwen3-pilot"
);

const provider = (process.env.QWEN_PROVIDER || "self-hosted").trim();

const providerDefaults = {
  "self-hosted": {
    baseUrl: "https://qwen.paperclip-internal.example/v1",
    model: "Qwen/Qwen3-8B-AWQ",
    authLabel: "Bearer token required",
    apiKeyEnvVar: "QWEN_VLLM_API_KEY",
    noteSuffix:
      "This manifest expects a private vLLM endpoint that you control.",
  },
  "digitalocean-serverless": {
    baseUrl: "https://inference.do-ai.run/v1",
    model: "alibaba-qwen3-32b",
    authLabel: "DigitalOcean inference key required",
    apiKeyEnvVar: "DIGITALOCEAN_INFERENCE_KEY",
    noteSuffix:
      "This manifest targets DigitalOcean Serverless Inference instead of a self-hosted GPU box.",
  },
};

const selectedProvider =
  providerDefaults[provider] || providerDefaults["self-hosted"];

const endpointBaseUrl =
  process.env.QWEN_ENDPOINT_BASE_URL || selectedProvider.baseUrl;

const endpointModel =
  process.env.QWEN_ENDPOINT_MODEL || selectedProvider.model;

const endpointApiKeyEnvVar =
  process.env.QWEN_ENDPOINT_API_KEY_ENV_VAR ||
  selectedProvider.apiKeyEnvVar;

const pilotAgentNames = (
  process.env.PAPERCLIP_PILOT_AGENT_NAMES ||
  "Data Analyst,Metrics & Analytics Engineer,SEO & Content Strategist,Platform Intelligence Analyst"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const note = [
  "This file is a deployment manifest, not a blind live patch.",
  "Use it after the Qwen endpoint is healthy and after the live Paperclip HTTP adapter field names are confirmed in the authenticated UI.",
  "Do not bulk-apply this to the full Hadhr fleet.",
  selectedProvider.noteSuffix,
].join(" ");

const manifest = {
  generatedAt: new Date().toISOString(),
  purpose: "Qwen3 Paperclip pilot manifest",
  provider,
  note,
  qwenEndpoint: {
    baseUrl: endpointBaseUrl,
    model: endpointModel,
    auth: selectedProvider.authLabel,
    apiKeyEnvVar: endpointApiKeyEnvVar,
  },
  recommendedRuntime: {
    wakeOnDemand: true,
    intervalSec: 0,
    maxConcurrentRuns: 1,
  },
  pilotAgents: pilotAgentNames.map((name) => ({
    name,
    proposedAdapterType: "http",
    proposedAdapterIntent: {
      protocol: "OpenAI-compatible",
      baseUrl: endpointBaseUrl,
      model: endpointModel,
      timeoutSec: 120,
    },
  })),
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const outputPath = path.join(OUTPUT_DIR, "qwen3-pilot-manifest.json");
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

console.log(JSON.stringify({ ok: true, outputPath, manifest }, null, 2));
