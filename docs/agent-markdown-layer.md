# Strata Agent Markdown Layer

## Identity Lock

- Company: Strata Risk Advisory / Strata Saudi.
- Canonical website: https://www.stratasaudi.com.
- Vercel project: `stratasaudi-website`.
- Public contact: advisory@stratasaudi.com, +966 50 006 7865, and the approved source-identifying WhatsApp link published in `data/company.json`.
- Google-system owner: abdulaziz.alrayes@gmail.com.
- Do not use Vercel preview URLs as public website URLs.
- Do not mix this repository, deployment, analytics, Paperclip workspace, or discovery files with another company.

## Owner AI Policy

The Strata-approved public Content-Signal policy is:

`ai-train=no, search=yes, ai-input=yes`

This means public search and answer grounding are allowed, while AI training is not authorized. This policy is copied from Strata's own `robots.txt`, not from another company.

## What Was Added

The website now has deterministic Markdown companions for canonical, indexable sitemap pages only. Browsers continue to receive HTML from the canonical URLs. Agents may request Markdown by sending:

`Accept: text/markdown`

Example:

`curl -H 'Accept: text/markdown' https://www.stratasaudi.com/services`

Direct sidecars are also available:

- https://www.stratasaudi.com/index.md
- https://www.stratasaudi.com/about.md
- https://www.stratasaudi.com/services.md
- https://www.stratasaudi.com/counterparties.md
- https://www.stratasaudi.com/why-saudi.md
- https://www.stratasaudi.com/insights.md
- https://www.stratasaudi.com/faq.md
- https://www.stratasaudi.com/ethics.md
- https://www.stratasaudi.com/contact.md
- https://www.stratasaudi.com/privacy.md
- https://www.stratasaudi.com/terms.md
- https://www.stratasaudi.com/mandate-checklist.md
- https://www.stratasaudi.com/fidic-claims-saudi-arabia.md

Direct `.md` sidecars return `X-Robots-Tag: noindex, follow` so agents can read them without creating duplicate indexable pages.

## Extraction Rules

Markdown generation uses `node-html-parser` for structured HTML parsing. It extracts public main content and removes:

- navigation
- footers
- forms
- scripts and styles
- noscript/iframe/template content
- hidden and aria-hidden content
- screen-reader-only utility text

It preserves:

- page title and meta description
- canonical URL
- language
- Markdown-only agent summaries that explain the correct use of each companion page
- Markdown-only agent use contract covering positioning, legal boundary, approval requirements, and non-fit routing
- source provenance for the HTML source, Markdown sidecar, extraction scope, sitemap basis, and Content-Signal policy
- links to the canonical structured resources agents should prefer for routing and inquiry preparation
- headings, paragraphs, lists, details, tables, blockquotes, and code blocks
- public links
- images with meaningful alt text
- public JSON-LD structured data

## Files

- `scripts/generate-markdown-companions.js`: deterministic generator with `--check`.
- `scripts/validate-markdown-layer.js`: repeatable validation suite.
- `lib/markdown-layer.js`: Accept negotiation, sidecar mapping, and Markdown response headers.
- `api/page.js`: canonical URL Markdown negotiation and direct `.md` sidecar serving.
- `api/public-resource.js`: allowlisted delivery and privacy-safe observability for public agent-discovery and structured-data files.
- `lib/agent-observability.js`: aggregates crawler families and resource classes, without retaining raw user agents, IP addresses, enquiry text, names, or email addresses.
- `lib/security-headers.js`: shared dynamic response security and public caching policy.
- `markdown/*.md`: generated companions.
- `llms.txt`, `llms-full.txt`, `.well-known/agent-card.json`, `.well-known/api-catalog`, and `openapi.json`: discovery updates.

## Validation Commands

Run after any major content update:

```sh
npm run generate:markdown
npm run validate:markdown
npm run validate:agent-readiness
npm run validate:seo
npm run validate:analytics
npm run test:agent-observability
npm run validate:release
```

Run the monthly advanced readiness audit:

```sh
npm run audit:monthly
```

Generate a privacy-safe weekly agent/crawler report from Vercel or server log JSONL:

```sh
npm run report:agent-observability -- path/to/logs.jsonl
```

The weekly report summarizes discovery reads, Markdown negotiation, direct `.md` sidecar reads, MCP reads, OpenAPI reads, tool calls, resource reads, fit classes, and user-agent families. It must not include names, emails, message bodies, or confidential project facts.

Production functions also send aggregate GA4 events when `GA_MEASUREMENT_ID` and `GA_API_SECRET` are configured. These events use daily, agent-family aggregate client identifiers and contain only:

- event type
- agent family
- resource type and public path
- representation type
- MCP tool name
- fit class

They never contain raw user agents, IP addresses, form values, enquiry text, names, companies, or email addresses. Preview and local environments do not send these events. In GA4, use an Exploration filtered to the event names `agent_resource_read`, `crawler_page_read`, `mcp_discovery_read`, `mcp_resource_read`, `mcp_tool_call`, `inquiry_preparation`, `inquiry_scope_match`, and `procurement_fit_screen`. Break down by `agent_family`, `resource_type`, `resource_path`, `representation`, and `tool_name` after registering those event parameters as event-scoped custom dimensions.

## Privacy-Safe Analytics

Browser analytics use one direct GA4 loader through `/api/client-config.js` and `/assets/strata-analytics.js`. GTM, Mixpanel, and the legacy analytics loader are not used. The enquiry form records only form start, privacy-safe submission diagnostics, and errors. Field names, field values, value lengths, names, emails, company details, and enquiry text are never sent as browser analytics events.

Public contact links emit the privacy-safe `contact_click` event. WhatsApp links also emit `whatsapp_click` with the public destination number and `click_source=strata_saudi_website`; the prefilled WhatsApp message and URL query string are never sent as analytics parameters.

The production conversion candidate is the server-confirmed `lead_submission` event. It is emitted only after the confidential enquiry email is accepted for delivery. Keep browser `form_submit_success` as a diagnostic event and do not mark both as GA4 key events.

## Indexing And Runtime Controls

- Canonical English pages remain indexable.
- Every URL containing `?lang=` returns both HTML meta `noindex, follow` and HTTP `X-Robots-Tag: noindex, follow`, preventing query-language duplicates while keeping the language experience available.
- Direct Markdown sidecars remain `noindex, follow`.
- Public page and Markdown functions run in Vercel's Mumbai region (`bom1`), the nearest currently deployable Vercel runtime after Dubai returned unavailable at deployment.
- HTML and Markdown use one-hour shared caching with stale-while-revalidate; `Vary: Accept` keeps HTML and Markdown representations separate.
- Dynamic responses use CSP, HSTS, clickjacking protection, MIME protection, a strict referrer policy, and a restricted permissions policy.

Before deployment, also run:

```sh
vercel build --prod --scope abdulazizalrayes-3914s-projects
```

## Live Endpoint Checks

After deployment, check:

```sh
curl -I https://www.stratasaudi.com/services
curl -I -H 'Accept: text/markdown' https://www.stratasaudi.com/services
curl -I -H 'Accept: text/markdown;q=0, text/html;q=1' https://www.stratasaudi.com/services
curl -I https://www.stratasaudi.com/services.md
curl -I https://www.stratasaudi.com/index.md
```

Expected Markdown headers:

- `Content-Type: text/markdown; charset=utf-8`
- `Vary: Accept`
- `Content-Location: https://www.stratasaudi.com/{page}.md`
- `Content-Language: en`
- `Content-Signal: ai-train=no, search=yes, ai-input=yes`
- `Link: <https://www.stratasaudi.com/{page}>; rel="canonical"`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: ... frame-ancestors 'none' ...`
- direct `.md` only: `X-Robots-Tag: noindex, follow`

## Copy Pattern For Other Companies

Copy the architecture, not the business facts:

1. Confirm the target company's canonical domain, owner accounts, deployment project, and AI policy.
2. Generate sidecars only for that company's canonical, indexable sitemap pages.
3. Replace all company facts, contact details, social links, legal boundaries, and Content-Signal policy.
4. Update that company's `llms.txt`, `llms-full.txt`, agent card, API catalog, OpenAPI, and validation docs.
5. Run the generator in `--check` mode and prove HTML hashes are unchanged before rollout.

Do not copy Strata's AI policy, contact details, category, service claims, or account ownership into another company.

## Rollback

Rollback is low risk because the layer is additive and non-visual:

1. Revert `api/page.js`, `api/public-resource.js`, `lib/markdown-layer.js`, `lib/agent-observability.js`, `lib/security-headers.js`, analytics changes, generated `markdown/*.md`, and discovery/doc updates.
2. Remove `node-html-parser` from `package.json` and `package-lock.json` if no longer used.
3. Redeploy the previous known-good Vercel production deployment.
4. Verify `Accept: text/markdown` returns HTML fallback and direct `.md` routes no longer resolve.
