#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT =
  process.env.STRATA_WORKSPACE_CWD ||
  path.join(__dirname, "..");

const checks = [
  {
    file: "AGENTS.md",
    required: [
      "The canonical public website domain for Strata Saudi is `https://www.stratasaudi.com`.",
      "Do not use Vercel preview, deployment, or project URLs as the Strata website URL",
      "Specifically do not present `https://stratasaudi-website-qgjqqrtfy-abdulazizalrayes-3914s-projects.vercel.app` as the website address",
    ],
  },
  {
    file: "STRATA_PROJECT_OPERATING_INSTRUCTION.md",
    required: [
      "Strata Saudi is the only brand context for this repository.",
      "OpenCode as the default adapter",
      "Codex only for critical engineering work",
      "Claude Code only for final executive reasoning",
      "no visual site changes without explicit user approval",
      "The canonical public website domain for Strata Saudi is `https://www.stratasaudi.com`.",
      "Do not use Vercel preview, deployment, or project URLs as the Strata website URL",
      "Specifically do not present `https://stratasaudi-website-qgjqqrtfy-abdulazizalrayes-3914s-projects.vercel.app` as the website address",
      "do not propose website changes as the primary path to growth.",
      "Focus lead generation on outbound, introducers, trigger-event capture, authority distribution, search capture using the current approved site, CRM discipline, and follow-up quality.",
      "Live outbound email sending may only use `advisory@stratasaudi.com`.",
      "Before any live outbound email is sent, the board must be shown the intended recipients and the exact message content unless send authority is explicitly delegated later.",
      "The only approved business mailbox for actual CRM-linked sending and receiving is `advisory@stratasaudi.com`.",
      "Paperclip for Strata is now cloud-based and should be treated as cloud-first, not Mac-local by default.",
      "The primary Paperclip access point for Strata is `https://ai.eijarat.com`.",
      "Paperclip cloud was upgraded to `v2026.707.0`",
      "For important or main Strata Paperclip work, use `opencode/big-pickle`",
      "For cheaper helper, utility, formatting, or low-risk work, use `opencode/deepseek-v4-flash-free`",
      "Remove and avoid stale human-hiring logic from old tasks, workflows, sync scripts, and future operating patterns.",
    ],
  },
  {
    file: path.join("paperclip", "branding", "STRATA_SAUDI_CONTEXT.md"),
    required: [
      "The canonical public website domain is `https://www.stratasaudi.com`",
      "do not use Vercel preview, deployment, or project URLs as the Strata website URL in Paperclip artifacts",
      "Do not present `https://stratasaudi-website-qgjqqrtfy-abdulazizalrayes-3914s-projects.vercel.app` as the website address",
    ],
  },
  {
    file: "CEO_AGENT_CREATION_POLICY.md",
    required: [
      "No new agent defaults to `codex` or `claude_code` without explicit written justification.",
      "Executive title alone is not a premium-adapter justification.",
      "Routine operations default to `opencode`.",
      "Do not preserve or reintroduce stale human-hiring workflow logic for routine Strata agent creation, updates, or syncs.",
      "Default to direct create, update, and sync inside the live Strata Paperclip company unless the board explicitly asks for a formal exception review.",
    ],
  },
  {
    file: path.join("paperclip", "agents", "prompt-overrides.json"),
    required: [
      "Do not propose or implement visual site changes without explicit user approval.",
      "Do not publish externally without explicit board approval unless publishing authority is later delegated.",
      "Do not send live outbound messages without explicit board approval unless send authority is later delegated.",
      "Do not treat raw asset files or rough documents as acceptable public-facing authority experiences without explicit board approval.",
      "The canonical public website domain for Strata Saudi is `https://www.stratasaudi.com`.",
      "Do not use Vercel preview, deployment, or project URLs as the Strata website URL",
    ],
  },
  {
    file: path.join("scripts", "sync-paperclip-company.js"),
    required: [
      "CANONICAL_WEBSITE_DOMAIN = \"https://www.stratasaudi.com\"",
      "stratasaudi-website-qgjqqrtfy-abdulazizalrayes-3914s-projects.vercel.app",
      "OPENCODE_MAIN_MODEL = \"opencode/big-pickle\"",
      "OPENCODE_HELPER_MODEL = \"opencode/deepseek-v4-flash-free\"",
      "PAPERCLIP_EXECUTION_CWD",
      "/home/paperclip/.paperclip/instances/default/projects/9ff6f561-3790-444f-87c8-89cb0911775b/53acb115-e136-414d-af1b-0c2bfb6d966f/_default",
      "websiteDomainControl",
    ],
  },
];

const failures = [];

for (const check of checks) {
  const filePath = path.join(ROOT, check.file);
  if (!fs.existsSync(filePath)) {
    failures.push(`${check.file}: file missing`);
    continue;
  }

  const body = fs.readFileSync(filePath, "utf8");
  for (const snippet of check.required) {
    if (!body.includes(snippet)) {
      failures.push(`${check.file}: missing required instruction -> ${snippet}`);
    }
  }
}

if (failures.length) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: "Instruction integrity check failed.",
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
      message: "Instruction integrity check passed.",
      filesChecked: checks.map((item) => item.file),
    },
    null,
    2,
  ),
);
