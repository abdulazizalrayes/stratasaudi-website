const crypto = require("crypto");

const { buildDemandReport, RETENTION_DAYS } = require("../lib/agent-demand-learning");
const {
  deleteExpiredDemandRecords,
  readDemandRecords,
  storeDemandReport,
} = require("../lib/agent-demand-store");
const { setSecurityHeaders } = require("../lib/security-headers");

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  setSecurityHeaders(res, { cache: false });
  res.end(JSON.stringify(payload));
}

function authorized(req) {
  const secret = String(process.env.CRON_SECRET || "");
  const authorization = String(req.headers.authorization || "");
  if (secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function cadenceFor(req) {
  const requested = String(req.query?.cadence || "daily").toLowerCase();
  return requested === "weekly" ? "weekly" : "daily";
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }
  if (!authorized(req)) {
    sendJson(res, 401, { ok: false, error: "Unauthorized." });
    return;
  }

  try {
    const cadence = cadenceFor(req);
    const now = new Date();
    const lookbackDays = cadence === "weekly" ? 15 : 3;
    const records = await readDemandRecords({
      since: new Date(now.getTime() - lookbackDays * 86400000),
    });
    const report = buildDemandReport(records, { cadence, now });
    const storage = await storeDemandReport(report);
    const retention = await deleteExpiredDemandRecords(
      new Date(now.getTime() - RETENTION_DAYS * 86400000),
    );
    sendJson(res, 200, {
      ok: true,
      company_id: "strata-saudi",
      cadence,
      generated_at: report.generated_at,
      eligible_records: report.evidence_summary.eligible_records,
      unanswered_questions: report.unanswered_questions,
      clustering_performed: report.unsupervised_analysis.performed,
      actual_model_trained: false,
      report_stored_privately: storage.stored,
      duplicate_report_suppressed: storage.duplicate,
      expired_records_deleted: retention.deleted,
      raw_questions_returned: false,
    });
  } catch (_error) {
    sendJson(res, 503, {
      ok: false,
      company_id: "strata-saudi",
      error: "Private demand review is temporarily unavailable.",
    });
  }
};

module.exports.authorized = authorized;
module.exports.cadenceFor = cadenceFor;
