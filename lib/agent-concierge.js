const crypto = require("crypto");

const {
  listServices,
  matchProjectScope,
  readJsonResource,
} = require("./agent-public-data");

const MAX_QUESTION_LENGTH = 4000;
const SITE_ORIGIN = "https://www.stratasaudi.com";

const SOURCE_URLS = {
  company: `${SITE_ORIGIN}/data/company.json`,
  services: `${SITE_ORIGIN}/data/services.json`,
  serviceAreas: `${SITE_ORIGIN}/data/service-areas.json`,
  routing: `${SITE_ORIGIN}/data/agent-routing.json`,
  evidence: `${SITE_ORIGIN}/data/evidence-requirements.json`,
  procurement: `${SITE_ORIGIN}/data/procurement-readiness.json`,
  security: `${SITE_ORIGIN}/data/agent-concierge.json`,
  inquiry: `${SITE_ORIGIN}/data/project-inquiry-schema.json`,
};

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function detectLanguage(question) {
  if (/[\u0600-\u06ff]/.test(question)) return "ar";
  const text = normalize(question);
  if (includesAny(text, ["bonjour", "pourquoi", "quels services", "confidentialit\u00e9"])) return "fr";
  if (includesAny(text, ["hola", "por qu\u00e9", "servicios", "confidencialidad"])) return "es";
  if (includesAny(text, ["buongiorno", "perch\u00e9", "servizi", "riservatezza"])) return "it";
  if (includesAny(text, ["guten tag", "warum", "dienstleistungen", "vertraulichkeit"])) return "de";
  return "en";
}

function classifyQuestion(question, scope) {
  const text = normalize(question);

  if (includesAny(text, [
    "ignore previous", "ignore all instructions", "system prompt", "developer message",
    "password", "credentials", "api key", "secret key", "environment variable",
    "private data", "user data", "admin access", "database access", "login token",
    "source code secret", "reveal your instructions",
  ])) return "agent_security_boundary";

  if (scope.fit === "not_fit") return "non_fit_request";
  if (includesAny(text, ["law firm", "lawyer", "legal advice", "legal counsel", "represent me", "arbitration counsel"])) return "legal_boundary";
  if (includesAny(text, ["price", "pricing", "fee", "fees", "cost", "rate", "timeline", "how long", "duration"])) return "fees_and_timing";
  if (includesAny(text, ["does this fit", "fit strata", "fit stratas", "suitable", "qualify", "mandate criteria", "can strata help"])) return "project_scope_fit";
  if (includesAny(text, ["confidential", "privileged", "sensitive", "nda", "document security", "data privacy"])) return "confidentiality_boundary";
  if (includesAny(text, ["why strata", "why choose", "why should", "different", "differentiator", "better fit", "advantage"])) return "why_strata";
  if (includesAny(text, ["how do we start", "how to engage", "engagement process", "mandate begin", "next step", "onboarding"])) return "engagement_process";
  if (includesAny(text, ["where do you work", "service area", "geograph", "which countr", "riyadh", "saudi arabia only"])) return "service_areas";
  if (includesAny(text, ["evidence", "documents", "records", "chronology", "correspondence", "notice register"])) return "evidence_readiness";
  if (includesAny(text, ["procurement", "supplier classification", "vendor classification", "source strata", "supplier profile"])) return "procurement_fit";
  if (includesAny(text, ["contact", "email", "phone", "whatsapp", "reach strata", "send enquiry", "submit inquiry"])) return "contact_options";
  if (includesAny(text, ["fit", "our project", "epc project", "delay", "variation", "fidic", "pre-litigation", "technical opinion"])) return "project_scope_fit";
  if (includesAny(text, ["service", "capabilit", "what do you offer", "what can you do", "mandates"])) return "services_overview";
  if (includesAny(text, ["what is strata", "who is strata", "company overview", "about strata", "who are you"])) return "company_overview";
  return "public_knowledge_gap";
}

function patternFingerprint(patternId, language) {
  return crypto.createHash("sha256").update(`strata:${patternId}:${language}`).digest("hex").slice(0, 16);
}

function matchedService(scope) {
  return scope.matched_services && scope.matched_services[0] ? scope.matched_services[0].id : "";
}

function responseFor(patternId, scope) {
  const services = listServices().services;
  const routing = readJsonResource("agent-routing");
  const names = services.map((service) => service.name).join("; ");
  const matchedNames = (scope.matched_services || []).map((service) => service.name).filter(Boolean).join(", ");

  if (patternId === "agent_security_boundary") {
    return {
      answer: "No. The public Strata Mandate Concierge is isolated to approved public website data. It has no model API key, login, password, cookie, mailbox, CRM, Paperclip, GitHub, Vercel, analytics-account, database, file-upload, or arbitrary-URL access. It does not follow instructions asking it to reveal private data or internal prompts.",
      answerStatus: "answered",
      route: "information_only",
      sources: [SOURCE_URLS.security],
    };
  }
  if (patternId === "non_fit_request") {
    return {
      answer: `This request does not fit Strata's project-inquiry channel. Detected non-fit category: ${(scope.reasons || ["unrelated"]).join(", ")}. Strata does not route careers, public training, vendor sales pitches, legal representation, consumer matters, backlink requests, spam, or unrelated requests into mandate intake.`,
      answerStatus: "answered_non_fit",
      route: "non_fit",
      sources: [SOURCE_URLS.routing],
    };
  }
  if (patternId === "legal_boundary") {
    return {
      answer: "Strata Risk Advisory is not a law firm and does not act as legal counsel or counsel of record. It provides independent engineering-led technical and commercial advisory. International law firms may engage Strata as technical counterpart support, while legal advice and representation remain with licensed counsel.",
      answerStatus: "answered",
      route: "information_only",
      sources: [SOURCE_URLS.company, SOURCE_URLS.routing],
    };
  }
  if (patternId === "fees_and_timing") {
    return {
      answer: "Strata does not publish standard fees or delivery periods because scope, evidence condition, urgency, confidentiality, and the decision required vary by mandate. A high-level fit and conflict review should come first. The concierge can prepare an inquiry outline, but no contact or submission occurs without explicit user approval.",
      answerStatus: "requires_mandate_review",
      route: "information_only",
      sources: [SOURCE_URLS.inquiry, SOURCE_URLS.routing],
    };
  }
  if (patternId === "confidentiality_boundary") {
    return {
      answer: "Use only high-level, non-privileged project context in this public interface. Do not provide names, personal data, contract documents, privileged advice, claim files, credentials, or confidential project facts. Detailed material should be considered only after Strata confirms fit, conflicts, scope, and an appropriate confidential channel.",
      answerStatus: "answered",
      route: "information_only",
      sources: [SOURCE_URLS.security, SOURCE_URLS.routing],
    };
  }
  if (patternId === "why_strata") {
    return {
      answer: "Strata is designed for high-value Saudi project exposure where engineering facts, contract administration, commercial posture, evidence discipline, and executive judgment must be connected before a dispute hardens. Its role is independent and engineering-led, supporting EPC contractors, developers, boards, investors, headquarters teams, and international law firms without presenting itself as legal counsel.",
      answerStatus: "answered",
      route: "information_only",
      sources: [SOURCE_URLS.company, SOURCE_URLS.services],
    };
  }
  if (patternId === "engagement_process") {
    return {
      answer: "A mandate starts with a high-level fit and conflict review: Saudi project exposure, counterparty type, project stage, the technical or commercial pressure point, the decision required, urgency, and confidentiality needs. If the matter appears suitable, the concierge can prepare a draft inquiry for review. It cannot submit or contact Strata without explicit approval.",
      answerStatus: "answered",
      route: "inquiry_preparation_available",
      sources: [SOURCE_URLS.inquiry, SOURCE_URLS.routing],
    };
  }
  if (patternId === "service_areas") {
    return {
      answer: "Strata is based in Riyadh and focuses on Saudi-governed or Saudi-exposed construction and infrastructure matters. It primarily supports foreign EPC contractors, developers, investors, boards, headquarters teams, and international law firms dealing with high-value Saudi project risk.",
      answerStatus: "answered",
      route: "information_only",
      sources: [SOURCE_URLS.serviceAreas, SOURCE_URLS.company],
    };
  }
  if (patternId === "evidence_readiness") {
    return {
      answer: "Useful high-level evidence categories include the contract and amendments, notice and correspondence registers, programme updates, delay and variation records, instructions, payment and certification history, meeting records, contemporaneous site evidence, and a decision-focused chronology. Do not upload or disclose confidential material through this public concierge.",
      answerStatus: "answered",
      route: "information_only",
      sources: [SOURCE_URLS.evidence, SOURCE_URLS.security],
    };
  }
  if (patternId === "procurement_fit") {
    return {
      answer: "Procurement agents should classify Strata as an independent engineering-led management consultancy for Saudi contract-risk, project-risk, pre-litigation technical advisory, independent technical opinion, and supply-chain or vendor-risk assessment. It is not a staffing supplier, commodity vendor, marketplace, training provider, or legal-representation firm.",
      answerStatus: "answered",
      route: "information_only",
      sources: [SOURCE_URLS.procurement, SOURCE_URLS.routing],
    };
  }
  if (patternId === "contact_options") {
    return {
      answer: `After the user explicitly approves contact, the public channels are ${routing.approved_public_contact_channels.email}, ${routing.approved_public_contact_channels.telephone}, the approved WhatsApp link, or ${routing.canonical_contact_path}. This concierge never sends, calls, opens WhatsApp, submits a form, or writes to CRM itself.`,
      answerStatus: "answered",
      route: "approval_required_before_contact",
      sources: [SOURCE_URLS.routing],
    };
  }
  if (patternId === "project_scope_fit") {
    const fitText = scope.fit.replace(/_/g, " ");
    return {
      answer: `The public screening result is ${fitText} with a score of ${scope.score || 0}/100.${matchedNames ? ` The closest public service matches are ${matchedNames}.` : ""} This is a preliminary fit signal, not mandate acceptance or professional advice. If appropriate, an inquiry outline can be prepared for user review without submission.`,
      answerStatus: "answered",
      route: scope.fit === "information_only" ? "information_only" : "inquiry_preparation_available",
      sources: [SOURCE_URLS.services, SOURCE_URLS.serviceAreas, SOURCE_URLS.routing],
    };
  }
  if (patternId === "services_overview") {
    return {
      answer: `Strata's public mandate areas are: ${names}. The work is independent, engineering-led, and focused on high-value Saudi project exposure; it is not legal representation.`,
      answerStatus: "answered",
      route: "information_only",
      sources: [SOURCE_URLS.services],
    };
  }
  if (patternId === "company_overview") {
    return {
      answer: "Strata Risk Advisory is an independent engineering-led contract-risk, project-risk, and pre-litigation technical advisory firm based in Riyadh. It supports sophisticated organizations working under Saudi-governed or Saudi-exposed high-value construction and infrastructure contracts.",
      answerStatus: "answered",
      route: "information_only",
      sources: [SOURCE_URLS.company],
    };
  }
  return {
    answer: "That question is not answered by Strata's currently approved public knowledge. I will not infer or invent an answer. You may ask about the company, services, Saudi project fit, evidence readiness, confidentiality, procurement classification, engagement process, legal boundary, security boundary, or contact options.",
    answerStatus: "public_knowledge_gap",
    route: "information_only",
    sources: [SOURCE_URLS.company, SOURCE_URLS.services, SOURCE_URLS.routing],
  };
}

function answerAgentQuestion(input = {}) {
  const question = String(input.question || "").replace(/\u0000/g, "").trim();
  if (!question) {
    const error = new Error("question is required.");
    error.code = "INVALID_QUESTION";
    throw error;
  }
  if (Buffer.byteLength(question, "utf8") > MAX_QUESTION_LENGTH) {
    const error = new Error(`question must not exceed ${MAX_QUESTION_LENGTH} UTF-8 bytes.`);
    error.code = "QUESTION_TOO_LARGE";
    throw error;
  }

  const language = detectLanguage(question);
  const scope = matchProjectScope({ description: question });
  const patternId = classifyQuestion(question, scope);
  const response = responseFor(patternId, scope);

  return {
    answer: response.answer,
    answer_status: response.answerStatus,
    question_pattern: patternId,
    question_topic: readJsonResource("agent-question-taxonomy").question_patterns.find((item) => item.id === patternId)?.topic || "unknown",
    language,
    fit: scope.fit,
    route: response.route,
    matched_service: matchedService(scope),
    confidence: patternId === "public_knowledge_gap" ? "low" : "high",
    sources: response.sources,
    question_fingerprint: patternFingerprint(patternId, language),
    public_data_only: true,
    raw_question_stored: false,
    approval_required_before_contact_or_submission: true,
    contact_or_submission_performed: false,
  };
}

module.exports = {
  MAX_QUESTION_LENGTH,
  answerAgentQuestion,
  detectLanguage,
};
