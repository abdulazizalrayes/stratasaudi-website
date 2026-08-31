# Strata Project Operating Instruction

Strata Saudi is the only brand context for this repository.

Operating priorities:

- premium mandate acquisition over mass lead volume
- discreet, technically serious positioning
- OpenCode as the default adapter
- Codex only for critical engineering work
- Claude Code only for final executive reasoning
- governed browser access through an explicit allowlist
- no secrets in repo content
- no visual site changes without explicit user approval

Business-positioning control:

- Strata Saudi is not a legal firm and must not be positioned or described as one.
- Strata Saudi operates as a premium commercial pre-litigation, contract-risk, project-risk, and technical advisory business.
- When working with law firms or dispute-adjacent matters, agents must position Strata as an engineering-led commercial and technical subject-matter expert, not as counsel.
- Any copy, prompt, workflow, or agent behavior that drifts toward law-firm positioning should be treated as a positioning error and corrected.

Website-domain control:

- The canonical public website domain for Strata Saudi is `https://www.stratasaudi.com`.
- Do not use Vercel preview, deployment, or project URLs as the Strata website URL in prompts, reports, public materials, agent outputs, CRM records, SEO/GEO/AEO work, or Paperclip artifacts.
- Specifically do not present `https://stratasaudi-website-qgjqqrtfy-abdulazizalrayes-3914s-projects.vercel.app` as the website address; it is only a temporary deployment preview for internal validation.
- When a website URL is required, use `https://www.stratasaudi.com` unless the board explicitly asks to inspect a preview deployment.

Implementation rule:

- audit if present
- preserve what is strong
- amend what is weak
- create what is missing

Visual-change control:

- Do not change the visual design of the website without explicit user approval.
- Visual design includes layout, typography, colors, spacing, component styling, imagery, interaction patterns, and other user-facing presentation changes.
- Non-visual fixes such as analytics, tracking, copy updates, backend logic, CRM wiring, and invisible technical improvements may proceed unless they materially affect the user-facing experience.
- If a task may change the visible site, stop, describe the proposed visual impact briefly, and wait for approval before implementing it.
- The baseline visual website is the board-approved Strata site already created by the user; do not replace, redesign, expand, or optimize visible pages unless the board explicitly asks for that exact change.
- Do not expose raw text files, rough working documents, direct asset URLs, or other unstyled public-facing artifacts on the website unless the board explicitly approves that exact experience.
- Public-facing downloadable or linked materials should be presented through a professional Strata page or approved asset experience, not as raw file output.
- Default operating stance: do not propose website changes as the primary path to growth.
- Focus lead generation on outbound, introducers, trigger-event capture, authority distribution, search capture using the current approved site, CRM discipline, and follow-up quality.
- If website changes could help, treat them as optional board-review items rather than the default growth lever.

SEO-execution control:

- SEO, GEO, AEO, and AI-discoverability work must default to non-visual execution unless the board explicitly approves a visible website change.
- Allowed by default:
  - sitemap repair
  - robots and indexing governance
  - canonical and hreflang governance planning
  - structured data and metadata fixes
  - Search Console diagnostics
  - analytics tagging and attribution fixes
  - internal technical crawl/error cleanup that does not alter the approved visible experience
- Not allowed by default without board approval:
  - new public pages
  - rewritten visible sections
  - new forms
  - new cards, modules, or navigation items
  - removal of visible content blocks
  - new downloadable public assets
  - image additions
  - branded 404 redesign
  - Arabic public-site rollout
  - any look, feel, layout, or UX change
- When reviewing an SEO audit, agents must separate:
  - safe non-visual fixes that can proceed
  - board-review items that are excluded unless explicitly approved

External-action control:

- Drafting external-facing materials is approved by default.
- Live sending of outbound emails, messages, or other direct outreach remains approval-gated unless the board explicitly delegates send authority.
- Live outbound email sending may only use `advisory@stratasaudi.com`.
- Before any live outbound email is sent, the board must be shown the intended recipients and the exact message content unless send authority is explicitly delegated later.
- Publishing external-facing content, including LinkedIn posts, articles, newsletters, or downloadable public authority assets, remains approval-gated unless the board explicitly delegates publishing authority.
- If a task crosses from draft preparation into live external release, stop, summarize what is ready, and wait for approval before sending or publishing.

Business-email control:

- The only approved business mailbox for actual CRM-linked sending and receiving is `advisory@stratasaudi.com`.
- Do not treat any non-`@stratasaudi.com` address as an approved Strata business mailbox.
- Do not route live CRM-linked sending or receiving through personal, sister-brand, vendor, or unrelated addresses.
- If mailbox configuration drifts away from `advisory@stratasaudi.com`, treat it as an operating issue and correct it.

Paperclip environment control:

- Paperclip for Strata is now cloud-based and should be treated as cloud-first, not Mac-local by default.
- Do not assume the active control plane is running on a local Mac server unless explicitly confirmed for that task.
- The primary Paperclip access point for Strata is `https://ai.eijarat.com`.
- If API or automation scripts need a base URL, prefer the configured cloud endpoint and only fall back to local endpoints when the board explicitly confirms a local session is in use.
- If cloud access is gated by Cloudflare Access, browser-authenticated inspection is required before diagnosing app-internal failures.
- The last owner-confirmed stable Paperclip baseline is `v2026.824.1`; verify the running version through `/api/health` or the authenticated running-version surface before every Paperclip-dependent operation.
- Treat `/api/version` as non-canonical unless the current release exposes it; use `/api/health` or the authenticated running-version surface as the version source.
- Use the improved attention and Decisions queue, Skill Studio, search, run recovery, cost telemetry, secret-access controls, and Office attachments when relevant.
- Do not enable experimental Paperclip features without explicit board approval.
- Do not change existing agents or model assignments without reviewing the live configuration first.
- Confirm Paperclip company health, agent status, and model availability before applying agent cleanup, model migration, heartbeat recovery, or blocked-task remediation.
- For important or main Strata Paperclip work, use `opencode/big-pickle` through the OpenCode adapter.
- For cheaper helper, utility, formatting, or low-risk work, the approved model is `opencode/deepseek-v4-flash-free` through the OpenCode adapter.
- The last owner-confirmed provider catalog did not advertise `opencode/deepseek-v4-flash-free`; do not silently substitute another helper model, and surface the mismatch if helper execution is required.
- Kimi is not configured or approved for Strata.
- Do not assume older Paperclip behavior after an upgrade; inspect the live API/UI behavior first, then act.
- Some older agents may still carry stale model or adapter metadata from previous recovery passes; audit live agent `adapterType`, `adapterConfig.model`, and governance `providerModel` before cleanup.
- When familiarizing yourself with Paperclip changes, prefer live health/version, agent inventory, issue/run APIs, and authenticated UI evidence over stale local task notes.

Google-system ownership control:

- The canonical Google owner account for Strata Saudi systems is `abdulaziz.alrayes@gmail.com`.
- This applies to Google Analytics, Google Tag Manager, Google Search Console, and related Google property administration unless the board explicitly records a change.
- Do not ask the board again which Google account owns Strata unless there is direct evidence of an ownership change.
- If Google verification fails, treat it first as a browser-session, profile, permission-propagation, or account-switching problem inside Chrome, not as uncertainty about the canonical owner account.
- When documenting blockers, say `current Chrome session lacks effective access` rather than implying the Strata Google owner account is unknown.

Agent-lifecycle control:

- Remove and avoid stale human-hiring logic from old tasks, workflows, sync scripts, and future operating patterns.
- Strata is an active operating company in Paperclip; agent provisioning should default to direct create, update, and sync, not hire-request workflows.
- Do not route agent maintenance, routine architecture changes, or registry syncs through human hiring flows unless the board explicitly asks for a formal exception review.
