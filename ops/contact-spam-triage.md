# Contact submission triage

Strata only. No public layout, forms, scripts, copy, DNS, new processor, or paid service changes.

- `lead_submission` means a delivered, unreviewed enquiry, never a qualified client.
- All ordinary enquiries carry `qualification_status=pending_review`. Only owner review can establish qualification.
- Narrow English/Arabic unsolicited sales-offer patterns, without advisory context, are retained in the existing Private Email Junk folder with `$Junk`. They receive score zero and no `lead_submission` event.
- Contract, risk, claim and advisory context overrides solicitation patterns. Ambiguous and other-language messages remain in the inbox; this deliberately prioritizes avoiding false positives over detecting every spam message.
- No country, email-domain, IP, brand or word-only supplier blacklist. No CAPTCHA or new visitor friction.
- If quarantine fails, preserve the message using the existing SMTP inbox path, retain its suspected status and suppress the lead event. If both storage paths fail, return an error rather than pretend delivery succeeded.
- Spam is recoverable subject to the mailbox provider's existing retention policy. Periodically inspect false positives; do not automatically delete messages or auto-reply.
- November 11 and November 15, 2026 submissions were owner-reviewed as unrelated sales solicitations: two submissions, zero qualified leads. Historical GA4 events are not deleted or relabelled by this release.
- Browser submission-success events remain diagnostics and are not qualified-lead evidence.

Tests: `npm run validate:analytics`, `npm run validate:release`. Synthetic fixtures run with mocked mail and analytics only. No live test submissions.

Rollback: revert this release and restore the preceding Vercel deployment `dpl_Gj49g4999KKbqLk1cXeSFdoanh5A`. Existing spam messages can be moved back to Inbox manually; rollback does not move them.
