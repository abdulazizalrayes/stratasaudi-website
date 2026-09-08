# Strata Private Agent-Demand Learning

## Identity lock

- Company: Strata Saudi / Strata Risk Advisory only
- Canonical domain: `https://www.stratasaudi.com`
- Hosting and scheduled processing: existing Strata Vercel project
- Private storage and report delivery: `advisory@stratasaudi.com` on the existing Strata Private Email account
- Source repository: `abdulazizalrayes/stratasaudi-website`
- Content-Signal: `ai-train=no, search=yes, ai-input=yes`

Do not copy records, credentials, folders, schedules, or conclusions to another company. Vercel preview URLs are not public Strata URLs.

## Business-specific scope

This layer learns about demand for Strata's engineering-led contract-risk, project-risk, supply-chain risk, independent technical opinion, board-risk, and pre-litigation technical advisory services.

The generic concepts of product brands, product dimensions, stock quantities, catalogue availability, and retail demand do not fit Strata's business. They are therefore not retained. The business-appropriate attributes are:

- mandate/service interest
- buyer type
- project-risk need
- contract framework, such as FIDIC form families
- project stage
- sector
- Saudi geography at country, city, or broad-region level
- evidence or specification gap
- generalized project-value band
- generalized urgency
- answer status and public-knowledge gap

Counterparty names, project names, contract identifiers, exact values, raw quantities, personal data, and confidential project facts are excluded.

## Public and private separation

The public A2A and MCP concierge remains deterministic, public-data-only, and stateless. It has no public learning-memory read path and cannot use learning records in answers. It does not retrain itself or any conversational model.

For eligible prospective-client or awareness interactions, the server creates a private demand signal from allowlisted attributes. The record contains:

- a fixed representative question plus allowlisted demand signals
- the exact approved public reply returned by the concierge
- English or Arabic response language
- pattern, topic, fit, route, answer status, and interface
- evidence class and deduplication key
- an owner-guidance placeholder

The record never contains the raw submitted question, name, email, telephone number, IP address, user-agent string, source identifier, credential, document, private URL, or confidential project narrative.

Synthetic tests, careers, internships, training requests, supplier sales or registration pitches, spam, prompt injection, suspected abuse, and unrelated requests are excluded from demand evidence. Their aggregate routing class may be counted in privacy-safe observability, but their submitted text is not stored.

## English and Arabic reliability

The concierge supports English and Arabic answers. Arabic input receives professional Arabic output. Non-Arabic input defaults to English, avoiding a language label that does not match the returned answer.

Supplier, vendor, and procurement wording is handled in three ways:

1. Client-side supplier, subcontractor, procurement, or supply-chain risk on a Saudi project may be treated as mandate demand.
2. Selling to Strata, registering as its supplier, internships, careers, training, and unrelated pitches are rejected from mandate intake.
3. Ambiguous wording triggers one English or Arabic clarification question. It does not guess, collect contact details, or prepare an inquiry.

## Private storage

No database or new data processor is introduced. The implementation uses two private folders in the existing Strata mailbox:

- `Strata Agent Demand`
- `Strata Agent Demand Reports`

Each eligible demand record is an RFC 822 message with a JSON body appended directly through IMAP. The deterministic daily key suppresses repeated equivalent records before persistence. Records are retained for 180 days. The private scheduled review deletes older records.

Persistence is disabled outside the Vercel production environment, so local tests and preview deployments cannot write learning records.

The public A2A and MCP responses never return mailbox data. The private folders are not exposed through A2A, MCP, Markdown, OpenAPI, public data, or website routes.

## Statistical and unsupervised analysis

Daily and weekly reports provide counts for services, needs, contract frameworks, stages, sectors, geographies, evidence gaps, generalized value bands, urgency, languages, and answer status.

Exact record replays are deduplicated. A demand signature contributes no more than three observations per day in storage and analysis. This preserves a bounded frequency signal while limiting coordinated repetition and poisoned traffic from dominating recommendations.

When at least 12 clean, deduplicated records exist in the period, the report runs deterministic token-set agglomerative clustering. A group is reported only when at least three records cluster at the configured similarity threshold. This is bounded unsupervised analysis. It is not a trained model.

When the threshold is not met, statistical reporting continues and the report explicitly states that model-based findings are unsupported. No improvement percentage is claimed without a separate measured experiment.

## Daily and weekly review

Vercel Cron invokes two authenticated private routes:

- daily at 06:30 Asia/Riyadh
- weekly on Monday at 07:00 Asia/Riyadh

`CRON_SECRET` must be present in the Strata Vercel production environment. Vercel sends it as a bearer token. The routes return only a minimal operational summary and use `no-store` and `noindex, nofollow`.

Each report is appended to `Strata Agent Demand Reports` and to the Strata Inbox for owner review. Duplicate schedule invocations do not create duplicate reports.

The report shows each safe question summary, the exact public reply, answer status, evidence class, and `Awaiting owner guidance`. Owner comments in Codex or Paperclip must be recorded against the referenced record before any answer, FAQ, service, offering, price, or sales change is proposed. Nothing is changed automatically.

## Recommendation evidence

Every recommendation includes:

- supporting count
- analysis period
- uncertainty
- evidence source
- genuine-demand, prospect-awareness, and synthetic evidence counts
- owner-approval requirement

Reports distinguish genuine potential-client demand from prospect awareness. They state that observed A2A and MCP traffic is not the entire market and is not automatically a verified sales lead.

## Validation

Run:

```bash
npm run test:agent-demand-learning
npm run test:agent-concierge
npm run test:mcp-readonly
npm run test:agent-observability
npm run validate:release
```

The tests cover:

- contact, credential, URL, identifier, and telephone redaction
- raw-question exclusion
- company isolation
- 180-day retention filtering
- deterministic deduplication
- per-signature poisoning caps
- synthetic-test exclusion
- English ambiguity clarification
- Arabic answers and Arabic non-fit routing
- client-side vendor-risk versus supplier-sales routing
- statistical reporting
- clustering thresholds and labels
- no actual model training
- private record serialization
- private cron authentication

## Sample owner report

The private Inbox report is headed `Daily Strata agent-demand review` or `Weekly Strata agent-demand review` and includes:

```text
Record: strata-demand-YYYY-MM-DD-...
Evidence: observed_potential_client_demand
Language: en or ar
Question: fixed representative question plus approved demand signals
Strata public reply: exact deterministic reply returned to the agent
Answer status: answered, clarification_required, or public_knowledge_gap
Owner guidance: Awaiting owner guidance
```

## Cost and infrastructure

- No public conversational LLM call
- No model training
- No new database
- No new data processor
- No local server
- No iCloud runtime or storage
- Existing Vercel Functions, Vercel Cron, and Strata Private Email only

Operation is designed to remain within existing low-volume allowances. This is not an unlimited-free guarantee; Vercel invocation and mailbox usage should be reviewed as traffic grows.

## First-week review

After seven complete production days, review:

1. eligible record count and genuine-versus-awareness split
2. unanswered and clarification-required questions
3. English and Arabic distribution
4. duplicate and poisoning-cap exclusions
5. report delivery and retention behavior
6. whether the sample meets the clustering threshold
7. owner guidance on each proposed public-answer or service improvement

Do not change production answers or services during the first-week review. Present evidence-supported proposals for approval.

## Rollback

Revert the demand-learning release commit and redeploy the prior known-good production commit. Remove the two private cron definitions if only the schedule must be disabled. The public concierge, website, Markdown layer, SEO/AEO/GEO surfaces, and inquiry form remain independently operable.
