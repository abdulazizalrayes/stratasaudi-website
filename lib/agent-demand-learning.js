const crypto = require("crypto");

const TAXONOMY = require("../data/agent-question-taxonomy.json");

const COMPANY_ID = "strata-saudi";
const SCHEMA_VERSION = "2026-09-08";
const RETENTION_DAYS = 180;
const MAX_ANALYSIS_RECORDS = 500;
const MIN_CLUSTER_RECORDS = 12;
const MIN_CLUSTER_SIZE = 3;
const POISONING_CAP_PER_SIGNATURE_PER_DAY = 3;

const REPRESENTATIVE_QUESTIONS = new Map(
  TAXONOMY.question_patterns.map((item) => [item.id, item.representative_question]),
);

const TOKEN_GROUPS = {
  buyer_types: {
    epc_contractor: ["epc", "contractor", "مقاول", "مقاول رئيسي"],
    developer: ["developer", "owner", "project owner", "مطوّر", "مطور", "مالك المشروع"],
    international_law_firm: ["law firm", "external counsel", "مكتب محاماة", "مستشار قانوني خارجي"],
    board_or_investor: ["board", "investor", "investment committee", "مجلس الإدارة", "مستثمر", "لجنة الاستثمار"],
    headquarters_team: ["headquarters", "regional office", "hq team", "المقر الرئيسي", "الإدارة الإقليمية"],
  },
  needs: {
    delay_and_programme: ["delay", "programme", "schedule", "extension of time", "eot", "تأخير", "برنامج زمني", "تمديد مدة"],
    variations_and_change: ["variation", "change order", "scope change", "تغيير", "أمر تغييري", "تعديل نطاق"],
    notices_and_contract_administration: ["notice", "notification", "contract administration", "إشعار", "إدارة العقد"],
    evidence_and_chronology: ["evidence", "chronology", "records", "correspondence", "أدلة", "تسلسل زمني", "مراسلات", "سجلات"],
    payment_and_certification: ["payment", "certificate", "certification", "valuation", "دفعة", "مستخلص", "شهادة دفع", "تقييم"],
    technical_opinion: ["technical opinion", "independent opinion", "expert review", "رأي فني", "مراجعة مستقلة", "تقييم فني"],
    pre_litigation_readiness: ["pre-litigation", "dispute readiness", "claim readiness", "قبل التقاضي", "الاستعداد للنزاع", "تجهيز المطالبة"],
    vendor_and_supply_chain_risk: ["vendor risk", "supplier performance", "supply chain risk", "subcontractor risk", "مخاطر المورد", "أداء المورد", "سلسلة الإمداد", "مخاطر المقاول الباطن"],
    board_risk_governance: ["board briefing", "governance", "executive decision", "إحاطة مجلس الإدارة", "حوكمة", "قرار تنفيذي"],
  },
  contract_frameworks: {
    fidic: ["fidic", "فيديك"],
    fidic_red_book: ["red book", "الكتاب الأحمر"],
    fidic_yellow_book: ["yellow book", "الكتاب الأصفر"],
    fidic_silver_book: ["silver book", "الكتاب الفضي"],
    epc_turnkey: ["epc", "turnkey", "lump sum turnkey", "تسليم مفتاح", "عقد هندسة وتوريد وإنشاء"],
    saudi_governed_contract: ["saudi governed", "saudi law", "ksa contract", "عقد سعودي", "القانون السعودي"],
  },
  project_stages: {
    pre_tender: ["pre-tender", "before tender", "قبل الطرح", "ما قبل المناقصة"],
    tender: ["tender", "bid", "مناقصة", "عطاء"],
    pre_contract_award: ["pre-contract", "before award", "قبل الترسية", "قبل توقيع العقد"],
    live_project: ["live project", "under construction", "ongoing project", "مشروع قائم", "قيد التنفيذ"],
    claim_or_pre_litigation: ["claim", "dispute", "pre-litigation", "مطالبة", "نزاع", "قبل التقاضي"],
  },
  sectors: {
    infrastructure: ["infrastructure", "بنية تحتية"],
    transport: ["rail", "metro", "airport", "road", "transport", "سكك", "مترو", "مطار", "طرق", "نقل"],
    energy_and_utilities: ["energy", "power", "utility", "oil", "gas", "طاقة", "كهرباء", "مرافق", "نفط", "غاز"],
    water: ["water", "wastewater", "desalination", "مياه", "صرف صحي", "تحلية"],
    industrial: ["industrial", "plant", "factory", "صناعي", "مصنع", "منشأة صناعية"],
    real_estate_and_giga_projects: ["real estate", "giga project", "mixed use", "عقار", "مشروع ضخم", "متعدد الاستخدامات"],
    construction_general: ["construction", "building", "إنشاءات", "تشييد", "مبنى"],
  },
  geographies: {
    saudi_arabia: ["saudi arabia", "ksa", "saudi", "المملكة العربية السعودية", "السعودية"],
    riyadh: ["riyadh", "الرياض"],
    jeddah: ["jeddah", "جدة"],
    eastern_province: ["eastern province", "dammam", "khobar", "المنطقة الشرقية", "الدمام", "الخبر"],
    western_region: ["western region", "makkah", "medina", "المنطقة الغربية", "مكة", "المدينة"],
  },
  evidence_gaps: {
    notice_register: ["notice register", "سجل الإشعارات"],
    programme_records: ["programme update", "schedule update", "تحديث البرنامج", "تحديث الجدول"],
    correspondence_register: ["correspondence register", "سجل المراسلات"],
    contemporaneous_site_records: ["site records", "daily report", "contemporaneous", "سجلات الموقع", "التقرير اليومي", "سجلات معاصرة"],
    decision_chronology: ["decision chronology", "event chronology", "تسلسل القرارات", "التسلسل الزمني للأحداث"],
  },
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "strata", "risk", "advisory", "question",
  "what", "which", "does", "about", "into", "under", "public", "project", "saudi", "answer",
  "من", "في", "على", "إلى", "عن", "ما", "هل", "مع", "هذا", "هذه", "شركة", "مشروع", "السعودية",
]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function redactSensitiveText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[redacted-url]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[redacted-phone]")
    .replace(/\b(?:password|passcode|api[_ -]?key|secret|token|otp)\s*[:=]?\s*\S+/gi, "[redacted-secret]")
    .replace(/\b(?=[a-z0-9-]{12,}\b)(?=[a-z0-9-]*\d)(?=[a-z0-9-]*[a-z])[a-z0-9-]+\b/gi, "[redacted-identifier]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function extractGroups(text, groups) {
  return Object.entries(groups)
    .filter(([, terms]) => includesAny(text, terms))
    .map(([id]) => id)
    .sort();
}

function valueBand(text) {
  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/(?:sar|riyal|ريال)\s*(\d+(?:\.\d+)?)\s*(m|million|bn|billion|مليون|مليار)?/i) ||
    normalized.match(/(\d+(?:\.\d+)?)\s*(m|million|bn|billion|مليون|مليار)\s*(?:sar|riyal|ريال)/i);
  if (!match) return "not_disclosed";
  let amount = Number(match[1]);
  const unit = String(match[2] || "").toLowerCase();
  if (["bn", "billion", "مليار"].includes(unit)) amount *= 1000;
  if (!["m", "million", "bn", "billion", "مليون", "مليار"].includes(unit)) amount /= 1000000;
  if (!Number.isFinite(amount) || amount <= 0) return "not_disclosed";
  if (amount < 50) return "under_sar_50m";
  if (amount < 250) return "sar_50m_to_250m";
  if (amount < 500) return "sar_250m_to_500m";
  return "sar_500m_plus";
}

function urgencyBand(text) {
  if (includesAny(text, ["urgent", "immediate", "this week", "عاجل", "فوراً", "فورا", "هذا الأسبوع"])) return "immediate";
  if (includesAny(text, ["this month", "within a month", "هذا الشهر", "خلال شهر"])) return "this_month";
  if (includesAny(text, ["this quarter", "خلال الربع" ])) return "this_quarter";
  return "not_disclosed";
}

function extractApprovedDemandAttributes(question, result = {}) {
  const text = normalizeText(question);
  const attributes = {};
  for (const [field, groups] of Object.entries(TOKEN_GROUPS)) {
    attributes[field] = extractGroups(text, groups);
  }
  attributes.services = [...new Set([
    ...(result.matched_service ? [result.matched_service] : []),
    ...(text.includes("pre-contract") || text.includes("قبل توقيع") ? ["pre_contract_risk_review"] : []),
    ...(text.includes("technical opinion") || text.includes("رأي فني") ? ["technical_opinion"] : []),
    ...(text.includes("board") || text.includes("مجلس الإدارة") ? ["board_risk_briefing"] : []),
    ...(includesAny(text, ["vendor risk", "supply chain", "مخاطر المورد", "سلسلة الإمداد"]) ? ["vendor_risk_assessment"] : []),
    ...(includesAny(text, ["pre-litigation", "قبل التقاضي"]) ? ["pre_litigation_advisory"] : []),
  ])].sort();
  attributes.project_value_band = valueBand(text);
  attributes.urgency = urgencyBand(text);
  attributes.requested_products = [];
  attributes.commercial_brands = [];
  attributes.dimensions = [];
  attributes.raw_quantities = [];
  return attributes;
}

function trafficClassification({ question, result = {}, messageId = "", headers = {} }) {
  const userAgent = normalizeText(headers["user-agent"] || headers.user_agent);
  const syntheticHeader = normalizeText(headers["x-strata-synthetic"] || headers.x_strata_synthetic);
  const normalizedId = normalizeText(messageId);
  if (
    syntheticHeader === "true" ||
    (userAgent.includes("strata-") && userAgent.includes("test")) ||
    /^(test|synthetic|fixture)[-_]/.test(normalizedId)
  ) return "synthetic";
  if (result.question_pattern === "agent_security_boundary") return "suspected_abuse";
  if (result.fit === "not_fit" || result.route === "non_fit") return "non_fit";
  if (result.fit === "needs_clarification" || result.route === "clarification_required") return "ambiguous";
  if (["strong_fit", "possible_fit"].includes(result.fit) || result.route === "inquiry_preparation_available") {
    return "genuine_demand";
  }
  const text = normalizeText(question);
  if (
    result.question_pattern === "public_knowledge_gap" &&
    !includesAny(text, [
      "saudi", "ksa", "epc", "contract", "project", "delay", "variation", "fidic", "developer", "board",
      "السعودية", "عقد", "مشروع", "تأخير", "مقاول", "مطوّر", "مطور", "فيديك",
    ])
  ) return "unclassified";
  return "prospect_awareness";
}

function safeQuestionSummary(result, attributes) {
  const representative = REPRESENTATIVE_QUESTIONS.get(result.question_pattern) ||
    "A prospective-client question was not covered by approved public knowledge.";
  const signals = [
    ...attributes.services,
    ...attributes.needs,
    ...attributes.contract_frameworks,
    ...attributes.project_stages,
    ...attributes.sectors,
    ...attributes.geographies,
    ...(attributes.project_value_band !== "not_disclosed" ? [attributes.project_value_band] : []),
    ...(attributes.urgency !== "not_disclosed" ? [attributes.urgency] : []),
  ].slice(0, 12);
  return signals.length ? `${representative} Approved demand signals: ${signals.join(", ")}.` : representative;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value, length = 20) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function buildDemandRecord({ question, result, messageId = "", headers = {}, interfaceName = "a2a", now = new Date() }) {
  const classification = trafficClassification({ question, result, messageId, headers });
  if (!["genuine_demand", "prospect_awareness"].includes(classification)) {
    return { stored: false, classification, reason: "Only eligible client demand and prospect-awareness signals are persisted." };
  }
  const attributes = extractApprovedDemandAttributes(question, result);
  const day = now.toISOString().slice(0, 10);
  const signatureMaterial = canonicalJson({
    company_id: COMPANY_ID,
    day,
    classification,
    interface: interfaceName,
    language: result.language,
    question_pattern: result.question_pattern,
    attributes,
  });
  const dedupeKey = digest(signatureMaterial, 24);
  const occurrenceKey = digest(`${now.toISOString()}:${interfaceName}:${dedupeKey}`, 8);
  return {
    stored: true,
    classification,
    record: {
      schema_version: SCHEMA_VERSION,
      company_id: COMPANY_ID,
      record_type: "agent_demand_signal",
      record_id: `strata-demand-${day}-${dedupeKey}-${occurrenceKey}`,
      observed_at: now.toISOString(),
      source_interface: interfaceName,
      traffic_classification: classification,
      evidence_class: classification === "genuine_demand" ? "observed_potential_client_demand" : "observed_prospect_awareness",
      language: result.language === "ar" ? "ar" : "en",
      question_pattern: result.question_pattern,
      question_topic: result.question_topic,
      question_summary: safeQuestionSummary(result, attributes),
      public_reply: String(result.answer || "").slice(0, 4000),
      answer_status: result.answer_status,
      fit: result.fit,
      route: result.route,
      attributes,
      owner_guidance: [],
      dedupe_key: dedupeKey,
      privacy: {
        raw_question_stored: false,
        personal_data_stored: false,
        confidential_project_facts_stored: false,
        source_identifier_stored: false,
      },
    },
  };
}

function recordDate(record) {
  const value = new Date(record.observed_at);
  return Number.isNaN(value.getTime()) ? null : value;
}

function isCompanyRecord(record) {
  return Boolean(record && record.company_id === COMPANY_ID && record.record_type === "agent_demand_signal");
}

function withinRetention(record, now = new Date()) {
  const date = recordDate(record);
  if (!date) return false;
  return now.getTime() - date.getTime() <= RETENTION_DAYS * 86400000;
}

function countValues(records, selector) {
  const counts = {};
  for (const record of records) {
    const values = selector(record);
    for (const value of Array.isArray(values) ? values : [values]) {
      if (!value || value === "not_disclosed") continue;
      counts[value] = (counts[value] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function deduplicateAndCap(records) {
  const sorted = records.slice().sort((a, b) => String(a.observed_at).localeCompare(String(b.observed_at)) || String(a.record_id).localeCompare(String(b.record_id)));
  const seenIds = new Set();
  const signatureCounts = new Map();
  const kept = [];
  let duplicates = 0;
  let capped = 0;
  for (const record of sorted) {
    if (seenIds.has(record.record_id)) {
      duplicates += 1;
      continue;
    }
    seenIds.add(record.record_id);
    const day = String(record.observed_at || "").slice(0, 10);
    const signature = `${day}:${record.dedupe_key || record.question_pattern}`;
    const count = signatureCounts.get(signature) || 0;
    if (count >= POISONING_CAP_PER_SIGNATURE_PER_DAY) {
      capped += 1;
      continue;
    }
    signatureCounts.set(signature, count + 1);
    kept.push(record);
  }
  return { records: kept, duplicates, capped };
}

function tokensForRecord(record) {
  const attributeTokens = Object.values(record.attributes || {}).flatMap((value) => Array.isArray(value) ? value : [value]);
  return new Set(
    `${record.question_pattern || ""} ${record.question_topic || ""} ${attributeTokens.join(" ")}`
      .toLowerCase()
      .split(/[^a-z0-9\u0600-\u06ff_]+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function clusterRecords(records) {
  if (records.length < MIN_CLUSTER_RECORDS) {
    return {
      performed: false,
      reason: `At least ${MIN_CLUSTER_RECORDS} clean, deduplicated records are required.`,
      method: "deterministic token-set agglomerative clustering",
      trained_model: false,
      clusters: [],
    };
  }
  const clusters = [];
  for (const record of records.slice().sort((a, b) => String(a.record_id).localeCompare(String(b.record_id)))) {
    const tokens = tokensForRecord(record);
    let best = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const score = jaccard(tokens, cluster.tokens);
      if (score > bestScore) {
        best = cluster;
        bestScore = score;
      }
    }
    if (best && bestScore >= 0.35) {
      best.records.push(record);
      for (const token of tokens) best.tokens.add(token);
    } else {
      clusters.push({ records: [record], tokens });
    }
  }
  const material = clusters.filter((cluster) => cluster.records.length >= MIN_CLUSTER_SIZE).map((cluster, index) => ({
    id: `cluster_${index + 1}`,
    count: cluster.records.length,
    common_signals: [...cluster.tokens].sort().slice(0, 10),
    question_patterns: countValues(cluster.records, (record) => record.question_pattern),
    evidence_class: "observed_clean_deduplicated_activity",
  }));
  return {
    performed: true,
    reason: material.length ? "Material recurring groups met the minimum cluster size." : "No group met the minimum cluster size.",
    method: "deterministic token-set agglomerative clustering",
    trained_model: false,
    clusters: material,
  };
}

function uncertaintyFor(count) {
  if (count >= 10) return "moderate: repeated observed signals, not market-wide evidence";
  if (count >= 3) return "high: small observed sample";
  return "very high: isolated signal";
}

function topEntry(counts) {
  return Object.entries(counts)[0] || ["", 0];
}

function buildRecommendations(report) {
  const recommendations = [];
  const [service, serviceCount] = topEntry(report.statistical_baseline.services);
  const [need, needCount] = topEntry(report.statistical_baseline.needs);
  if (service && serviceCount >= 3) {
    recommendations.push({
      proposal: `Review whether public sales and agent answers make the ${service} mandate sufficiently clear.`,
      supporting_count: serviceCount,
      analysis_period: report.analysis_period,
      uncertainty: uncertaintyFor(serviceCount),
      evidence_source: "genuine and prospect-awareness activity after privacy filtering and deduplication",
      evidence_mix: report.evidence_summary.recommendation_evidence_mix,
      owner_approval_required: true,
    });
  }
  if (need && needCount >= 3) {
    recommendations.push({
      proposal: `Consider an owner-reviewed FAQ or sales-response improvement for recurring need: ${need}.`,
      supporting_count: needCount,
      analysis_period: report.analysis_period,
      uncertainty: uncertaintyFor(needCount),
      evidence_source: "genuine and prospect-awareness activity after privacy filtering and deduplication",
      evidence_mix: report.evidence_summary.recommendation_evidence_mix,
      owner_approval_required: true,
    });
  }
  if (report.unanswered_questions > 0) {
    recommendations.push({
      proposal: "Review the unanswered prospective-client question summaries and approve only verified public-answer improvements.",
      supporting_count: report.unanswered_questions,
      analysis_period: report.analysis_period,
      uncertainty: uncertaintyFor(report.unanswered_questions),
      evidence_source: "public_knowledge_gap records; raw questions are not retained",
      evidence_mix: report.evidence_summary.recommendation_evidence_mix,
      owner_approval_required: true,
    });
  }
  for (const cluster of report.unsupervised_analysis.clusters) {
    recommendations.push({
      proposal: `Review emerging demand group ${cluster.id}: ${cluster.common_signals.join(", ")}.`,
      supporting_count: cluster.count,
      analysis_period: report.analysis_period,
      uncertainty: uncertaintyFor(cluster.count),
      evidence_source: "unsupervised grouping of sanitized, deduplicated records",
      evidence_mix: report.evidence_summary.recommendation_evidence_mix,
      owner_approval_required: true,
    });
  }
  return recommendations;
}

function buildDemandReport(records, { cadence = "daily", now = new Date() } = {}) {
  const periodDays = cadence === "weekly" ? 7 : 1;
  const periodStart = new Date(now.getTime() - periodDays * 86400000);
  const previousStart = new Date(periodStart.getTime() - periodDays * 86400000);
  const valid = records.filter((record) => isCompanyRecord(record) && withinRetention(record, now));
  const excludedCompanyOrExpired = records.length - valid.length;
  const currentRaw = valid.filter((record) => {
    const date = recordDate(record);
    return date && date >= periodStart && date <= now;
  });
  const previousRaw = valid.filter((record) => {
    const date = recordDate(record);
    return date && date >= previousStart && date < periodStart;
  });
  const currentDeduped = deduplicateAndCap(currentRaw);
  const previousDeduped = deduplicateAndCap(previousRaw);
  const eligible = currentDeduped.records
    .filter((record) => ["genuine_demand", "prospect_awareness"].includes(record.traffic_classification))
    .slice(-MAX_ANALYSIS_RECORDS);
  const genuine = eligible.filter((record) => record.traffic_classification === "genuine_demand");
  const awareness = eligible.filter((record) => record.traffic_classification === "prospect_awareness");
  const clustering = clusterRecords(eligible);
  const report = {
    schema_version: SCHEMA_VERSION,
    company_id: COMPANY_ID,
    company: "Strata Risk Advisory",
    canonical_domain: "https://www.stratasaudi.com",
    private_report: true,
    cadence,
    generated_at: now.toISOString(),
    analysis_period: {
      start: periodStart.toISOString(),
      end: now.toISOString(),
      days: periodDays,
    },
    evidence_summary: {
      eligible_records: eligible.length,
      genuine_demand: genuine.length,
      prospect_awareness: awareness.length,
      synthetic_used_as_evidence: 0,
      non_fit_used_as_evidence: 0,
      suspected_abuse_used_as_evidence: 0,
      duplicate_records_removed: currentDeduped.duplicates,
      poisoning_cap_exclusions: currentDeduped.capped,
      wrong_company_or_expired_exclusions: excludedCompanyOrExpired,
      coverage: "Observed Strata A2A and MCP concierge interactions only; this is not the entire market.",
      recommendation_evidence_mix: {
        genuine_demand: genuine.length,
        prospect_awareness: awareness.length,
        synthetic: 0,
      },
    },
    statistical_baseline: {
      buyer_types: countValues(eligible, (record) => record.attributes?.buyer_types || []),
      services: countValues(eligible, (record) => record.attributes?.services || []),
      needs: countValues(eligible, (record) => record.attributes?.needs || []),
      contract_frameworks: countValues(eligible, (record) => record.attributes?.contract_frameworks || []),
      project_stages: countValues(eligible, (record) => record.attributes?.project_stages || []),
      sectors: countValues(eligible, (record) => record.attributes?.sectors || []),
      geographies: countValues(eligible, (record) => record.attributes?.geographies || []),
      evidence_gaps: countValues(eligible, (record) => record.attributes?.evidence_gaps || []),
      project_value_bands: countValues(eligible, (record) => record.attributes?.project_value_band || ""),
      urgency: countValues(eligible, (record) => record.attributes?.urgency || ""),
      languages: countValues(eligible, (record) => record.language),
      answer_statuses: countValues(eligible, (record) => record.answer_status),
      non_applicable_product_fields: {
        requested_products: "not retained: Strata provides professional advisory services rather than catalogue products",
        commercial_brands: "not retained: product-brand demand is not a Strata mandate attribute",
        dimensions: "not retained: physical-product dimensions are not a Strata mandate attribute",
        raw_quantities: "not retained: raw quantities may be confidential and are not necessary for demand analysis",
      },
    },
    unanswered_questions: eligible.filter((record) => record.answer_status === "public_knowledge_gap").length,
    questions_and_replies: eligible.map((record) => ({
      record_id: record.record_id,
      observed_at: record.observed_at,
      evidence_class: record.evidence_class,
      language: record.language,
      question_summary: record.question_summary,
      public_reply: record.public_reply,
      answer_status: record.answer_status,
      owner_guidance: Array.isArray(record.owner_guidance) && record.owner_guidance.length ? record.owner_guidance : ["Awaiting owner guidance"],
    })),
    changes_over_time: {
      current_eligible_records: eligible.length,
      previous_period_eligible_records: previousDeduped.records.filter((record) =>
        ["genuine_demand", "prospect_awareness"].includes(record.traffic_classification),
      ).length,
      absolute_change: eligible.length - previousDeduped.records.filter((record) =>
        ["genuine_demand", "prospect_awareness"].includes(record.traffic_classification),
      ).length,
      interpretation: "Directional only; low-volume agent traffic can change sharply and must not be generalized to the market.",
    },
    unsupervised_analysis: clustering,
    actual_model_training: {
      performed: false,
      public_conversational_model_retrained: false,
      explanation: "No model is trained. Counts and bounded unsupervised grouping are separate from model training.",
    },
    recommendations: [],
    governance: {
      retention_days: RETENTION_DAYS,
      storage: "Private Strata business mailbox folders on the existing provider",
      raw_conversations_stored: false,
      automatic_public_changes: false,
      automatic_offer_or_price_changes: false,
      owner_approval_required_for_recommendations: true,
    },
  };
  report.recommendations = buildRecommendations(report);
  if (!eligible.length) {
    report.recommendations.push({
      proposal: "Keep the statistical baseline running; there is not yet enough clean activity for evidence-supported demand changes.",
      supporting_count: 0,
      analysis_period: report.analysis_period,
      uncertainty: "not estimable: no eligible observations",
      evidence_source: "no eligible records",
      evidence_mix: report.evidence_summary.recommendation_evidence_mix,
      owner_approval_required: false,
    });
  }
  return report;
}

module.exports = {
  COMPANY_ID,
  MAX_ANALYSIS_RECORDS,
  MIN_CLUSTER_RECORDS,
  POISONING_CAP_PER_SIGNATURE_PER_DAY,
  RETENTION_DAYS,
  buildDemandRecord,
  buildDemandReport,
  clusterRecords,
  deduplicateAndCap,
  extractApprovedDemandAttributes,
  isCompanyRecord,
  redactSensitiveText,
  trafficClassification,
  withinRetention,
};
