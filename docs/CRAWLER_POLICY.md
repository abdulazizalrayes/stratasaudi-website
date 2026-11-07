# Strata crawler policy

Reviewed 2026-11-07 for https://www.stratasaudi.com only.
Owner policy: search=yes, ai-input=yes, ai-train=no.

## Access decisions

- OpenAI: allow OAI-SearchBot and ChatGPT-User; disallow GPTBot.
- Anthropic: allow Claude-SearchBot and Claude-User; disallow ClaudeBot.
- Google: allow Googlebot. Keep Google-Extended disallowed because its control
  covers both Gemini training and some Gemini grounding. This does not exclude
  the site from Google Search or Search AI features.
- Meta: explicitly allow meta-webindexer, meta-externalfetcher and
  facebookexternalhit; disallow meta-externalagent, whose documented purposes
  include foundation-model training. Do not invent a separate Muse crawler.
- Kimi: allow Kimi-SearchBot and Kimi-User; disallow KimiBot.
- Bing and Perplexity: preserve public search access.
- DeepSeek: public content remains accessible under the wildcard rule. Its
  official Search/Fetch documentation reviewed here does not identify a
  separate search crawler token or establish a training/retrieval split.
  Do not invent an allow rule or claim verified provider-origin access.
- The owner's reference to "jev" remains unidentified pending a product URL.

Every named retrieval group repeats all wildcard private-path exclusions:
specific robots groups do not inherit the wildcard group's rules.
No page, navigation, form, authentication, firewall or analytics changes are
needed for this policy update.

## Verification and limitations

Run `npm ci` and `npm run validate:release`. The Markdown validator checks
the allowed/blocked tokens and private-path exclusion parity.
After deployment, compare live robots.txt to the committed file and fetch
public HTML, llms.txt and Markdown with each named search/fetch User-Agent.
Check Content-Signal and canonical headers, and unchanged HTML hashes.

User-Agent probes test responses from our network, not verified provider IPs.
They are synthetic checks, not organic crawler visits or citations. No provider
account, paid API call or index submission is needed. Private resources must
remain protected by actual access controls; robots.txt is not authentication.

Robots directives and Content-Signal express usage preferences, not technical
DRM. They cannot guarantee that noncompliant scrapers never copy public text,
remove past training data, or prove how an unverified provider uses content.
Do not weaken security controls simply because a request claims to be a bot.

## Primary documentation

- https://developers.openai.com/api/docs/bots
- https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers
- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/
- https://www.kimi.ai/policies/kimi-crawlers
- https://api-docs.deepseek.com/guides/search/

Rollback: revert the crawler-policy PR and verify robots.txt again. No secrets,
bindings, paid services or account permissions were added or changed.
