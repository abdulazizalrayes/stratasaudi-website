# Strata Mandate Concierge

## Identity lock

- Company: Strata Risk Advisory / Strata Saudi
- Repository: `abdulazizalrayes/stratasaudi-website`
- Canonical domain: `https://www.stratasaudi.com`
- Hosting: Vercel
- Google-system owner: `abdulaziz.alrayes@gmail.com`
- Paperclip: Strata company at `https://ai.eijarat.com`
- Content policy: `ai-train=no, search=yes, ai-input=yes`

Do not copy credentials, policies, data, infrastructure assumptions, or telemetry into another company. Do not use Vercel preview URLs as the public Strata address.

## Purpose

The Strata Mandate Concierge is a non-visual, agent-only interface. It lets external agents ask what Strata does, why it may fit a high-value Saudi project-risk mandate, which services are relevant, how procurement should classify the firm, what high-level evidence is useful, and what safe next step applies.

The first release is deterministic. It does not use a model provider. This keeps answers inside approved public Strata data and removes public model-key cost, prompt-injection, retrieval, and data-exfiltration paths.

## Interfaces

- A2A Agent Card: `/.well-known/agent-card.json`
- A2A discovery: `/api/a2a`
- A2A v1.0 SendMessage: `/api/a2a/message:send`
- MCP: `/api/mcp`
- MCP tool: `ask_strata_concierge`
- Security contract: `/data/agent-concierge.json`
- Question taxonomy: `/data/agent-question-taxonomy.json`
- OpenAPI: `/openapi.json`

The A2A interface uses the official HTTP+JSON binding and requires `A2A-Version: 1.0`. It accepts `text/plain` message parts only. It returns a text answer and structured public-data metadata.

## Security boundary

The concierge has no access to:

- passwords, API keys, cookies, sessions, or login data
- mailbox, CRM, Paperclip, GitHub, Vercel, or Google accounts
- databases, private files, internal notes, or contact submissions
- file uploads, raw bytes, or arbitrary URLs
- persistent conversation history
- external AI or model-provider APIs

It cannot send email, place a call, open WhatsApp, book a meeting, submit a form, or trigger CRM activity. Those actions remain outside the endpoint and require explicit user approval.

Controls include an 8 KiB A2A body limit, text-only validation, A2A version validation, per-instance abuse throttling, no-store responses, noindex headers, security headers, fixed public sources, refusal of secret-extraction instructions, and no raw-question logging.

## Question intelligence

The owner requested visibility into what external agents ask so Strata can improve future public answers. The implementation does not retain raw questions because they may contain personal data, confidential project facts, privileged wording, or credentials.

Instead, each question maps to a fixed representative pattern such as:

- What is Strata Risk Advisory and what does it do?
- Which engineering-led advisory services does Strata provide?
- Does this Saudi project-risk matter fit Strata's mandate criteria?
- Why should an EPC contractor, developer, board, or law firm consider Strata?
- What are Strata's fees and engagement timing?
- Can the public concierge access passwords, accounts, user data, or private systems?

Production telemetry may record only pattern id, topic, answer status, language class, fit, route, matched service, and an aggregate pattern fingerprint. It must not record raw questions, names, emails, telephone numbers, IP addresses, message bodies, or confidential project facts.

Generate the board-readable report from exported Strata function logs:

```bash
npm run report:agent-questions -- path/to/strata-production-logs.jsonl
```

The weekly agent observability process should include this report when production logs are available. A `public_knowledge_gap` count is a content-governance signal, not permission to publish an unverified answer.

## Validation

```bash
npm run test:agent-concierge
npm run test:mcp-readonly
npm run validate:agent-readiness
npm run validate:release
```

Live A2A check after deployment:

```bash
curl -sS https://www.stratasaudi.com/api/a2a
curl -sS https://www.stratasaudi.com/api/a2a/message:send \
  -H 'A2A-Version: 1.0' \
  -H 'Content-Type: application/a2a+json' \
  --data '{"message":{"messageId":"public-check","role":"ROLE_USER","parts":[{"text":"What services does Strata provide?","mediaType":"text/plain"}]}}'
```

Also verify that normal canonical pages still return the same HTML and that their Markdown negotiation, sitemap, schema, forms, analytics, and security headers remain unchanged.

## Model-backed phase

Do not enable a model-backed concierge without separate owner approval covering provider, model, cost ceiling, distributed rate limiting, retention terms, regional/data-processing terms, prompt-injection evaluation, incident controls, and rollback. Any future model key must be a server-only Vercel environment variable and must never appear in HTML, browser JavaScript, public data, logs, Git, Paperclip artifacts, or client responses.

## Rollback

Revert the release commit or remove the two A2A routes from `vercel.json`, then redeploy the last known-good production commit. The existing website, Markdown layer, MCP resources, forms, and analytics do not depend on A2A, so the concierge can be removed independently.

## Paperclip record

After production verification, record the commit, Vercel deployment id, live endpoint evidence, test results, content policy, cost (`SAR 0` for the deterministic phase), question-reporting rule, risks, and rollback commit in the Strata Paperclip workspace. Do not record raw visitor questions or confidential project facts.
