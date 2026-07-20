# Strata Agent Markdown Layer

## Identity Lock

- Company: Strata Risk Advisory / Strata Saudi.
- Canonical website: https://www.stratasaudi.com.
- Vercel project: `stratasaudi-website`.
- Public contact: advisory@stratasaudi.com.
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
- headings, paragraphs, lists, details, tables, blockquotes, and code blocks
- public links
- images with meaningful alt text
- public JSON-LD structured data

## Files

- `scripts/generate-markdown-companions.js`: deterministic generator with `--check`.
- `scripts/validate-markdown-layer.js`: repeatable validation suite.
- `lib/markdown-layer.js`: Accept negotiation, sidecar mapping, and Markdown response headers.
- `api/page.js`: canonical URL Markdown negotiation and direct `.md` sidecar serving.
- `markdown/*.md`: generated companions.
- `llms.txt`, `llms-full.txt`, `.well-known/agent-card.json`, `.well-known/api-catalog`, and `openapi.json`: discovery updates.

## Validation Commands

Run after any major content update:

```sh
npm run generate:markdown
npm run validate:markdown
npm run validate:agent-readiness
npm run validate:seo
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

1. Revert `api/page.js`, `lib/markdown-layer.js`, `scripts/generate-markdown-companions.js`, `scripts/validate-markdown-layer.js`, `markdown/*.md`, and discovery/doc updates.
2. Remove `node-html-parser` from `package.json` and `package-lock.json` if no longer used.
3. Redeploy the previous known-good Vercel production deployment.
4. Verify `Accept: text/markdown` returns HTML fallback and direct `.md` routes no longer resolve.
