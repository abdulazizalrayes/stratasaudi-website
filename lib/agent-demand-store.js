const { mailboxConfig, APPROVED_BUSINESS_MAILBOX } = require("./private-email-client");

const DEMAND_FOLDER = "Strata Agent Demand";
const REPORT_FOLDER = "Strata Agent Demand Reports";
const MAX_FETCH_RECORDS = 1000;

function encodeSubject(value) {
  const text = String(value || "").replace(/[\r\n]+/g, " ").slice(0, 500);
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function messageId(value) {
  return `<${String(value || "strata-demand").replace(/[^a-z0-9.-]/gi, "-").slice(0, 180)}@demand.stratasaudi.com>`;
}

function buildJsonMessage({ id, subject, payload, date = new Date(), recordType }) {
  return [
    `Date: ${date.toUTCString()}`,
    `From: "Strata Demand Intelligence" <${APPROVED_BUSINESS_MAILBOX}>`,
    `To: <${APPROVED_BUSINESS_MAILBOX}>`,
    `Reply-To: <${APPROVED_BUSINESS_MAILBOX}>`,
    `Subject: ${encodeSubject(subject)}`,
    `Message-ID: ${messageId(id)}`,
    "MIME-Version: 1.0",
    "Content-Type: application/json; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "X-Strata-Company: strata-saudi",
    `X-Strata-Record-Type: ${recordType}`,
    "X-Strata-Private: true",
    "",
    JSON.stringify(payload, null, 2),
    "",
  ].join("\r\n");
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCounts(counts) {
  const entries = Object.entries(counts || {});
  return entries.length ? entries.map(([name, count]) => `${name}=${count}`).join(", ") : "none observed";
}

function countsHtml(counts) {
  return htmlEscape(formatCounts(counts));
}

function reportText(report) {
  const lines = [
    `${report.cadence === "weekly" ? "Weekly" : "Daily"} Strata agent-demand review`,
    `Period: ${report.analysis_period.start} to ${report.analysis_period.end}`,
    `Eligible observations: ${report.evidence_summary.eligible_records}`,
    `Genuine demand: ${report.evidence_summary.genuine_demand}`,
    `Prospect awareness: ${report.evidence_summary.prospect_awareness}`,
    `Unanswered questions: ${report.unanswered_questions}`,
    "",
    "Important: this covers observed Strata A2A and MCP interactions only. It does not represent the entire market.",
    "",
    "Demand baseline",
    `Buyer types: ${formatCounts(report.statistical_baseline.buyer_types)}`,
    `Services: ${formatCounts(report.statistical_baseline.services)}`,
    `Needs: ${formatCounts(report.statistical_baseline.needs)}`,
    `Contract frameworks: ${formatCounts(report.statistical_baseline.contract_frameworks)}`,
    `Project stages: ${formatCounts(report.statistical_baseline.project_stages)}`,
    `Sectors: ${formatCounts(report.statistical_baseline.sectors)}`,
    `Geographies: ${formatCounts(report.statistical_baseline.geographies)}`,
    `Evidence and specification gaps: ${formatCounts(report.statistical_baseline.evidence_gaps)}`,
    `Project-value bands: ${formatCounts(report.statistical_baseline.project_value_bands)}`,
    `Urgency: ${formatCounts(report.statistical_baseline.urgency)}`,
    `Languages: ${formatCounts(report.statistical_baseline.languages)}`,
    `Answer statuses: ${formatCounts(report.statistical_baseline.answer_statuses)}`,
    "Product brands, physical dimensions, and raw quantities are not retained because they do not fit Strata's professional-advisory demand model.",
    "",
    "Change from the prior comparable period",
    `Current eligible observations: ${report.changes_over_time.current_eligible_records}`,
    `Previous eligible observations: ${report.changes_over_time.previous_period_eligible_records}`,
    `Absolute change: ${report.changes_over_time.absolute_change}`,
    report.changes_over_time.interpretation,
    "",
    "Questions and public replies",
  ];
  if (!report.questions_and_replies.length) lines.push("No eligible questions were observed in this period.");
  for (const item of report.questions_and_replies) {
    lines.push(
      "",
      `Record: ${item.record_id}`,
      `Evidence: ${item.evidence_class}`,
      `Language: ${item.language}`,
      `Question: ${item.question_summary}`,
      `Strata public reply: ${item.public_reply}`,
      `Answer status: ${item.answer_status}`,
      `Owner guidance: ${item.owner_guidance.join(" | ")}`,
    );
  }
  lines.push("", "Recommendations");
  for (const item of report.recommendations) {
    lines.push(
      "",
      `Proposal: ${item.proposal}`,
      `Supporting count: ${item.supporting_count}`,
      `Uncertainty: ${item.uncertainty}`,
      `Evidence: ${item.evidence_source}`,
      `Evidence mix: genuine=${item.evidence_mix.genuine_demand}, awareness=${item.evidence_mix.prospect_awareness}, synthetic=${item.evidence_mix.synthetic}`,
      `Owner approval required: ${item.owner_approval_required ? "Yes" : "No"}`,
    );
  }
  lines.push(
    "",
    "Analysis method",
    `Statistical reporting: enabled`,
    `Unsupervised clustering performed: ${report.unsupervised_analysis.performed ? "Yes" : "No"}`,
    `Clustering method: ${report.unsupervised_analysis.method}`,
    `Clustering outcome: ${report.unsupervised_analysis.reason}`,
    `Material clusters: ${report.unsupervised_analysis.clusters.length ? report.unsupervised_analysis.clusters.map((item) => `${item.id}=${item.count} (${item.common_signals.join(", ")})`).join("; ") : "none"}`,
    `Actual model trained: No`,
    `Retention: ${report.governance.retention_days} days`,
    "No recommendation changes services, prices, availability, FAQs, public answers, or the conversational agent without owner approval.",
  );
  return lines.join("\n");
}

function reportHtml(report) {
  const questionRows = report.questions_and_replies.length
    ? report.questions_and_replies.map((item) => `
      <section>
        <h3>${htmlEscape(item.question_summary)}</h3>
        <p><strong>Record:</strong> ${htmlEscape(item.record_id)}</p>
        <p><strong>Evidence:</strong> ${htmlEscape(item.evidence_class)} | <strong>Language:</strong> ${htmlEscape(item.language)}</p>
        <p><strong>Strata public reply:</strong> ${htmlEscape(item.public_reply)}</p>
        <p><strong>Answer status:</strong> ${htmlEscape(item.answer_status)}</p>
        <p><strong>Owner guidance:</strong> ${htmlEscape(item.owner_guidance.join(" | "))}</p>
      </section>`).join("")
    : "<p>No eligible questions were observed in this period.</p>";
  const recommendationRows = report.recommendations.map((item) => `
    <li>${htmlEscape(item.proposal)}<br>
      <small>Count: ${item.supporting_count}; uncertainty: ${htmlEscape(item.uncertainty)}; evidence: ${htmlEscape(item.evidence_source)}; evidence mix: genuine=${item.evidence_mix.genuine_demand}, awareness=${item.evidence_mix.prospect_awareness}, synthetic=${item.evidence_mix.synthetic}; owner approval: ${item.owner_approval_required ? "required" : "not required"}</small>
    </li>`).join("");
  return `<!doctype html>
<html lang="en"><body>
  <h1>${report.cadence === "weekly" ? "Weekly" : "Daily"} Strata agent-demand review</h1>
  <p><strong>Period:</strong> ${htmlEscape(report.analysis_period.start)} to ${htmlEscape(report.analysis_period.end)}</p>
  <ul>
    <li>Eligible observations: ${report.evidence_summary.eligible_records}</li>
    <li>Genuine demand: ${report.evidence_summary.genuine_demand}</li>
    <li>Prospect awareness: ${report.evidence_summary.prospect_awareness}</li>
    <li>Unanswered questions: ${report.unanswered_questions}</li>
  </ul>
  <p><strong>Coverage:</strong> ${htmlEscape(report.evidence_summary.coverage)}</p>
  <h2>Demand baseline</h2>
  <ul>
    <li>Buyer types: ${countsHtml(report.statistical_baseline.buyer_types)}</li>
    <li>Services: ${countsHtml(report.statistical_baseline.services)}</li>
    <li>Needs: ${countsHtml(report.statistical_baseline.needs)}</li>
    <li>Contract frameworks: ${countsHtml(report.statistical_baseline.contract_frameworks)}</li>
    <li>Project stages: ${countsHtml(report.statistical_baseline.project_stages)}</li>
    <li>Sectors: ${countsHtml(report.statistical_baseline.sectors)}</li>
    <li>Geographies: ${countsHtml(report.statistical_baseline.geographies)}</li>
    <li>Evidence and specification gaps: ${countsHtml(report.statistical_baseline.evidence_gaps)}</li>
    <li>Project-value bands: ${countsHtml(report.statistical_baseline.project_value_bands)}</li>
    <li>Urgency: ${countsHtml(report.statistical_baseline.urgency)}</li>
    <li>Languages: ${countsHtml(report.statistical_baseline.languages)}</li>
    <li>Answer statuses: ${countsHtml(report.statistical_baseline.answer_statuses)}</li>
  </ul>
  <p>Product brands, physical dimensions, and raw quantities are not retained because they do not fit Strata's professional-advisory demand model.</p>
  <h2>Change from the prior comparable period</h2>
  <p>Current: ${report.changes_over_time.current_eligible_records}; previous: ${report.changes_over_time.previous_period_eligible_records}; absolute change: ${report.changes_over_time.absolute_change}. ${htmlEscape(report.changes_over_time.interpretation)}</p>
  <h2>Questions and public replies</h2>
  ${questionRows}
  <h2>Recommendations</h2>
  <ul>${recommendationRows}</ul>
  <h2>Analysis method</h2>
  <p>Statistical reporting is enabled. Unsupervised clustering performed: ${report.unsupervised_analysis.performed ? "yes" : "no"}. Method: ${htmlEscape(report.unsupervised_analysis.method)}. Outcome: ${htmlEscape(report.unsupervised_analysis.reason)}. Actual model trained: no.</p>
  <p>Retention is ${report.governance.retention_days} days. No recommendation changes services, prices, availability, FAQs, public answers, or the conversational agent without owner approval.</p>
</body></html>`;
}

function buildReportMessage(report) {
  const label = report.cadence === "weekly" ? "Weekly" : "Daily";
  const date = report.generated_at.slice(0, 10);
  const boundary = `strata-demand-${date}-${report.cadence}`;
  const id = `strata-demand-report-${report.cadence}-${date}`;
  const text = reportText(report);
  const html = reportHtml(report);
  return [
    `Date: ${new Date(report.generated_at).toUTCString()}`,
    `From: "Strata Demand Intelligence" <${APPROVED_BUSINESS_MAILBOX}>`,
    `To: <${APPROVED_BUSINESS_MAILBOX}>`,
    `Reply-To: <${APPROVED_BUSINESS_MAILBOX}>`,
    `Subject: ${encodeSubject(`[Strata] ${label} agent-demand review - ${date}`)}`,
    `Message-ID: ${messageId(id)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "X-Strata-Company: strata-saudi",
    "X-Strata-Record-Type: agent_demand_report",
    "X-Strata-Private: true",
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function parseJsonMessage(source) {
  const text = Buffer.isBuffer(source) ? source.toString("utf8") : String(source || "");
  const separator = text.match(/\r?\n\r?\n/);
  if (!separator || separator.index === undefined) return null;
  const body = text.slice(separator.index + separator[0].length).trim();
  try {
    return JSON.parse(body);
  } catch (_error) {
    return null;
  }
}

async function connectMailbox() {
  const { ImapFlow } = require("imapflow");
  const config = mailboxConfig();
  if (!config.imap.auth.user || !config.imap.auth.pass) throw new Error("Private Email IMAP credentials are not configured.");
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: config.imap.auth,
    logger: false,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
  });
  await client.connect();
  return client;
}

async function ensureFolder(client, folder) {
  try {
    await client.mailboxCreate(folder);
  } catch (error) {
    if (!/already exists|exists/i.test(String(error && error.message))) throw error;
  }
}

async function subjectExists(client, folder, subject) {
  await client.mailboxOpen(folder, { readOnly: true });
  const ids = (await client.search({ subject }, { uid: true })) || [];
  return ids.length > 0;
}

async function subjectPrefixCount(client, folder, prefix) {
  await client.mailboxOpen(folder, { readOnly: true });
  const ids = (await client.search({ subject: prefix }, { uid: true })) || [];
  return ids.length;
}

async function storeDemandRecord(record) {
  const day = String(record.observed_at || "").slice(0, 10);
  const subjectPrefix = `[Strata Demand] ${day} ${record.dedupe_key} `;
  const subject = `${subjectPrefix}${record.record_id}`;
  const client = await connectMailbox();
  try {
    await ensureFolder(client, DEMAND_FOLDER);
    if (await subjectExists(client, DEMAND_FOLDER, subject)) {
      return { stored: false, duplicate: true, record_id: record.record_id };
    }
    if (await subjectPrefixCount(client, DEMAND_FOLDER, subjectPrefix) >= 3) {
      return { stored: false, duplicate: false, capped: true, record_id: record.record_id };
    }
    await client.append(
      DEMAND_FOLDER,
      buildJsonMessage({
        id: record.record_id,
        subject,
        payload: record,
        date: new Date(record.observed_at),
        recordType: "agent_demand_signal",
      }),
      ["\\Seen"],
      new Date(record.observed_at),
    );
    return { stored: true, duplicate: false, capped: false, record_id: record.record_id };
  } finally {
    await client.logout().catch(() => {});
  }
}

async function readDemandRecords({ since, maxRecords = MAX_FETCH_RECORDS } = {}) {
  const client = await connectMailbox();
  try {
    await ensureFolder(client, DEMAND_FOLDER);
    await client.mailboxOpen(DEMAND_FOLDER, { readOnly: true });
    const query = since ? { since } : { all: true };
    const ids = (await client.search(query, { uid: true })) || [];
    const selected = ids.slice(-Math.min(maxRecords, MAX_FETCH_RECORDS));
    const records = [];
    if (!selected.length) return records;
    for await (const message of client.fetch(selected, { source: true }, { uid: true })) {
      const record = parseJsonMessage(message.source);
      if (record) records.push(record);
    }
    return records;
  } finally {
    await client.logout().catch(() => {});
  }
}

async function deleteExpiredDemandRecords(cutoff) {
  const client = await connectMailbox();
  try {
    await ensureFolder(client, DEMAND_FOLDER);
    await client.mailboxOpen(DEMAND_FOLDER);
    const ids = (await client.search({ before: cutoff }, { uid: true })) || [];
    if (!ids.length) return { deleted: 0 };
    await client.messageDelete(ids, { uid: true });
    return { deleted: ids.length };
  } finally {
    await client.logout().catch(() => {});
  }
}

async function storeDemandReport(report) {
  const label = report.cadence === "weekly" ? "Weekly" : "Daily";
  const date = report.generated_at.slice(0, 10);
  const subject = `[Strata] ${label} agent-demand review - ${date}`;
  const message = buildReportMessage(report);
  const client = await connectMailbox();
  try {
    await ensureFolder(client, REPORT_FOLDER);
    const reportExists = await subjectExists(client, REPORT_FOLDER, subject);
    const inboxExists = await subjectExists(client, "INBOX", subject);
    if (reportExists && inboxExists) {
      return { stored: false, duplicate: true, subject };
    }
    if (!inboxExists) await client.append("INBOX", message, [], new Date(report.generated_at));
    if (!reportExists) await client.append(REPORT_FOLDER, message, ["\\Seen"], new Date(report.generated_at));
    return { stored: true, duplicate: false, subject };
  } finally {
    await client.logout().catch(() => {});
  }
}

module.exports = {
  DEMAND_FOLDER,
  MAX_FETCH_RECORDS,
  REPORT_FOLDER,
  buildJsonMessage,
  buildReportMessage,
  deleteExpiredDemandRecords,
  parseJsonMessage,
  readDemandRecords,
  reportHtml,
  reportText,
  storeDemandRecord,
  storeDemandReport,
  subjectPrefixCount,
};
