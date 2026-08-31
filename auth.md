# Strata Saudi auth.md

Canonical domain: https://www.stratasaudi.com

This file defines Strata Saudi's public agent access policy. Public discovery, data, LLM, OpenAPI, and read-only MCP resources require no authentication. Contact, form submission, email sending, phone calls, opening WhatsApp, meeting booking, CRM writes, or any outbound action requires explicit user approval before execution.

## Agent Registration

Public read-only agent access does not require registration.

- Agent audience: search crawlers, AI assistants, procurement agents, MCP clients, API clients, and CLI tools reading public Strata Saudi resources.
- Register URI: none for public read-only access.
- Provisioning endpoint: none for public read-only access.
- Supported method: unauthenticated HTTPS GET for public resources, read-only JSON-RPC for `/api/mcp`, and text-only A2A v1.0 HTTP+JSON for `/api/a2a/message:send`.
- Credential use: no credentials are issued for public read-only access.
- Approval rule: agents must obtain explicit user approval before submitting `/api/contact`, sending email, placing a call, opening WhatsApp, booking meetings, writing CRM data, or performing any outbound action.

Private, authenticated, or write-enabled agent access is not publicly available. If Strata later publishes protected agent accounts, OAuth or equivalent registration metadata should be added before agents rely on private endpoints.

## Step 1 - Discover

Agents may discover Strata's public resources through:

- Protected Resource Metadata: https://www.stratasaudi.com/.well-known/oauth-protected-resource
- Authorization Server Metadata: not published because Strata has no public OAuth authorization server.
- Agent auth block: not published in OAuth metadata because Strata does not issue public agent credentials.
- OpenAPI: https://www.stratasaudi.com/openapi.json
- MCP: https://www.stratasaudi.com/api/mcp
- A2A Agent Card: https://www.stratasaudi.com/.well-known/agent-card.json
- A2A SendMessage: https://www.stratasaudi.com/api/a2a/message:send
- API catalog: https://www.stratasaudi.com/.well-known/api-catalog

## Step 2 - Choose Registration Method

Supported registration methods:

- `public_read_only`: supported; no account, token, registration endpoint, or credential is required.
- `identity_assertion`: not supported for public access.
- `service_auth`: not supported for public access.
- `anonymous`: not supported for credential issuance.

Machine-readable registration summary:

```json
{
  "agent_auth": {
    "skill": "https://www.stratasaudi.com/auth.md",
    "register_uri": null,
    "claim_uri": null,
    "revocation_uri": null,
    "identity_types_supported": [],
    "credential_types_supported": [],
    "status": "public_read_only_no_registration"
  }
}
```

## Step 3 - Register

Do not register for public read-only access. Fetch the public resource directly over HTTPS or use the read-only MCP endpoint.

There is no public agent registration endpoint and no credential exchange for Strata's public resources.

## Step 4 - Use Credentials

No credentials are used for public read-only access. Agents must not invent API keys, bearer tokens, OAuth clients, user sessions, or delegated authority for Strata.

## Step 5 - Revoke

There are no public read-only credentials to revoke. If Strata later issues private agent credentials, revocation metadata and procedures should be added here before such credentials are used.

## Public Read-Only Access

The following resources are public and require no authentication:

- `/data/company.json`
- `/data/services.json`
- `/data/capabilities.json`
- `/data/service-areas.json`
- `/data/project-inquiry-schema.json`
- `/data/agent-routing.json`
- `/data/use-cases.json`
- `/data/fit-matrix.json`
- `/data/evidence-requirements.json`
- `/data/fidic-risk-signals.json`
- `/data/conversion-intelligence.json`
- `/data/indexing-control.json`
- `/data/authority-evidence.json`
- `/data/procurement-readiness.json`
- `/data/agent-concierge.json`
- `/data/agent-question-taxonomy.json`
- `/llms.txt`
- `/llms-full.txt`
- `/.well-known/agent-card.json`
- `/.well-known/ai-catalog.json`
- `/.well-known/api-catalog`
- `/.well-known/mcp.json`
- `/.well-known/mcp/server-card.json`
- `/.well-known/mcp/server-cards.json`
- `/.well-known/agent-skills/index.json`
- `/openapi.json`
- `/api/mcp`
- `/api/a2a`
- `/api/a2a/message:send`

The public A2A concierge accepts text questions only. It does not issue credentials, store conversations, accept files, fetch URLs, access private systems, or perform contact and submission actions. Its question telemetry stores representative pattern ids and aggregate dimensions only, never raw questions or confidential project facts.

## Action and Submission Access

`/api/contact` is a project inquiry submission endpoint. AI agents, procurement agents, browsers, MCP clients, API clients, and CLI tools must not call this endpoint unless the user explicitly approves the final submission.

Preparing a draft inquiry is allowed. Submitting it is not allowed without explicit approval.

## Privacy and Data Handling

Read-only resources do not require personal data. Agents should avoid collecting personal, confidential, privileged, or sensitive project details unless the user intends to prepare a real inquiry and approves the use of that information.

## Account Ownership

The canonical Google-system owner for Strata Saudi systems is `abdulaziz.alrayes@gmail.com`. Do not mix Strata accounts, analytics, Search Console, or API ownership with other company properties.
