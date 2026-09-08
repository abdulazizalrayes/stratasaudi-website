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
  return "en";
}

function classifyQuestion(question, scope) {
  const text = normalize(question);

  if (includesAny(text, [
    "ignore previous", "ignore all instructions", "system prompt", "developer message",
    "password", "credentials", "api key", "secret key", "environment variable",
    "private data", "user data", "admin access", "database access", "login token",
    "source code secret", "reveal your instructions", "تجاهل التعليمات", "تجاهل كل التعليمات",
    "تعليمات النظام", "رسالة المطور", "كلمة المرور", "كلمات المرور", "بيانات الدخول",
    "مفتاح api", "مفتاح واجهة", "مفتاح سري", "متغيرات البيئة", "بيانات خاصة",
    "بيانات المستخدم", "صلاحية المشرف", "قاعدة البيانات", "رمز الدخول", "اكشف تعليماتك",
  ])) return "agent_security_boundary";

  if (scope.fit === "not_fit") return "non_fit_request";
  if (scope.fit === "needs_clarification") return "commercial_intent_clarification";
  if (includesAny(text, ["law firm", "lawyer", "legal advice", "legal counsel", "represent me", "arbitration counsel", "محامي", "مكتب محاماة", "استشارة قانونية", "تمثيل قانوني", "تمثلونني"])) return "legal_boundary";
  if (includesAny(text, ["price", "pricing", "fee", "fees", "cost", "rate", "timeline", "how long", "duration", "سعر", "أسعار", "رسوم", "تكلفة", "أتعاب", "مدة", "كم يستغرق"])) return "fees_and_timing";
  if (includesAny(text, ["does this fit", "fit strata", "fit stratas", "suitable", "qualify", "mandate criteria", "can strata help", "هل يناسب", "هل تستطيع ستراتا", "هل يمكن لستراتا", "معايير التكليف"])) return "project_scope_fit";
  if (includesAny(text, ["confidential", "privileged", "sensitive", "nda", "document security", "data privacy", "سري", "سرية", "حساس", "اتفاقية عدم إفصاح", "خصوصية البيانات"])) return "confidentiality_boundary";
  if (includesAny(text, ["why strata", "why choose", "why should", "different", "differentiator", "better fit", "advantage", "لماذا ستراتا", "لماذا نختار", "ما الذي يميز", "الميزة"])) return "why_strata";
  if (includesAny(text, ["how do we start", "how to engage", "engagement process", "mandate begin", "next step", "onboarding", "كيف نبدأ", "كيف نتعاقد", "بدء التكليف", "الخطوة التالية"])) return "engagement_process";
  if (includesAny(text, ["where do you work", "service area", "geograph", "which countr", "riyadh", "saudi arabia only", "أين تعملون", "نطاق الخدمة", "أي مناطق", "الرياض", "داخل السعودية"])) return "service_areas";
  if (includesAny(text, ["evidence", "documents", "records", "chronology", "correspondence", "notice register", "أدلة", "مستندات", "سجلات", "تسلسل زمني", "مراسلات", "سجل الإشعارات"])) return "evidence_readiness";
  if (includesAny(text, ["procurement", "supplier classification", "vendor classification", "source strata", "supplier profile", "تصنيف المشتريات", "تصنيف المورد", "الملف التعريفي للمورد"])) return "procurement_fit";
  if (includesAny(text, ["contact", "email", "phone", "whatsapp", "reach strata", "send enquiry", "submit inquiry", "تواصل", "بريد", "هاتف", "واتساب", "إرسال استفسار", "تقديم استفسار"])) return "contact_options";
  if (includesAny(text, ["fit", "our project", "epc project", "delay", "variation", "fidic", "pre-litigation", "technical opinion", "مشروعنا", "مشروع هندسة", "تأخير", "أمر تغييري", "فيديك", "قبل التقاضي", "رأي فني"])) return "project_scope_fit";
  if (includesAny(text, ["service", "capabilit", "what do you offer", "what can you do", "mandates", "خدمات", "قدرات", "ماذا تقدمون", "ما هي تكليفاتكم"])) return "services_overview";
  if (includesAny(text, ["what is strata", "who is strata", "company overview", "about strata", "who are you", "ما هي ستراتا", "من هي ستراتا", "نبذة عن ستراتا", "من أنتم"])) return "company_overview";
  return "public_knowledge_gap";
}

function patternFingerprint(patternId, language) {
  return crypto.createHash("sha256").update(`strata:${patternId}:${language}`).digest("hex").slice(0, 16);
}

function matchedService(scope) {
  return scope.matched_services && scope.matched_services[0] ? scope.matched_services[0].id : "";
}

function arabicResponseFor(patternId, scope, routing) {
  const matchedNames = (scope.matched_services || []).map((service) => service.name).filter(Boolean).join("، ");
  const answers = {
    agent_security_boundary: "لا. مساعد ستراتا العام معزول ويعتمد حصراً على معلومات الموقع العامة المعتمدة. لا يملك مفتاح نموذج ذكاء اصطناعي، أو بيانات دخول، أو كلمات مرور، أو ملفات تعريف ارتباط، أو صلاحية قراءة البريد أو أنظمة إدارة العملاء أو Paperclip أو GitHub أو Vercel أو حسابات التحليلات أو قواعد البيانات أو رفع الملفات أو جلب روابط عشوائية. قد يُحفظ فقط مؤشر طلب منقح ومقيد في مخزن خاص، ولا يستطيع المساعد قراءته أو استخدامه لإجابة عامة. كما لا ينفذ التعليمات التي تطلب كشف بيانات خاصة أو تعليمات داخلية.",
    non_fit_request: "هذا الطلب لا يندرج ضمن قناة استفسارات تكليفات ستراتا. لا تستقبل القناة طلبات التوظيف أو التدريب أو التدريب التعاوني، ولا عروض الموردين أو المبيعات، ولا طلبات التمثيل القانوني أو شؤون المستهلكين أو الروابط الدعائية أو الرسائل غير ذات الصلة. لذلك لن نجمع بيانات تواصل لهذا الطلب.",
    commercial_intent_clarification: "مصطلحات المورد أو المشتريات هنا تحتمل معنيين. هل أنتم عميل محتمل يطلب مراجعة مخاطر مورد أو سلسلة إمداد ضمن مشروع سعودي، أم جهة ترغب في بيع منتجات أو التسجيل كمورد لدى ستراتا؟ الحالة الأولى قد تناسب نطاق ستراتا؛ أما عروض الموردين والتسجيل كمورد فلا تدخل في قناة التكليفات.",
    legal_boundary: "ستراتا للاستشارات بالمخاطر ليست مكتب محاماة ولا تقدم تمثيلاً قانونياً أو تعمل كمستشار قانوني مسجل في القضية. تقدم ستراتا استشارات فنية وتجارية مستقلة بقيادة هندسية. ويمكن لمكاتب المحاماة الدولية الاستعانة بها للدعم الفني، بينما تبقى المشورة والتمثيل القانونيان لدى محامٍ مرخص.",
    fees_and_timing: "لا تنشر ستراتا أتعاباً أو مدد تنفيذ موحدة، لأن ذلك يتغير بحسب نطاق التكليف، وحالة الأدلة، والاستعجال، والسرية، والقرار المطلوب. تبدأ العملية بمراجعة أولية للملاءمة وتعارض المصالح. ويمكن للمساعد إعداد مسودة استفسار للمراجعة، لكنه لا يتواصل مع ستراتا ولا يرسل شيئاً دون موافقة صريحة من المستخدم.",
    confidentiality_boundary: "استخدم في هذه الواجهة العامة معلومات عالية المستوى وغير سرية فقط. لا تذكر أسماء أو بيانات شخصية أو مستندات تعاقدية أو آراء محمية أو ملفات مطالبات أو بيانات دخول أو وقائع مشروع سرية. يُنظر في المواد التفصيلية فقط بعد تأكيد الملاءمة وتعارض المصالح والنطاق وتحديد قناة سرية مناسبة.",
    why_strata: "صُممت ستراتا للمخاطر في المشاريع السعودية عالية القيمة، حيث يجب ربط الوقائع الهندسية وإدارة العقد والموقف التجاري وانضباط الأدلة والحكم التنفيذي قبل أن يتصلب النزاع. تعمل باستقلالية وبقيادة هندسية لدعم مقاولي الهندسة والتوريد والإنشاء والمطورين ومجالس الإدارة والمستثمرين وفرق المقرات ومكاتب المحاماة الدولية، دون تقديم نفسها كمستشار قانوني.",
    engagement_process: "يبدأ التكليف بمراجعة أولية للملاءمة وتعارض المصالح تشمل التعرض لمشروع سعودي، ونوع الطرف، ومرحلة المشروع، ونقطة الضغط الفنية أو التجارية، والقرار المطلوب، والاستعجال، واحتياجات السرية. إذا بدا الأمر مناسباً، يمكن للمساعد إعداد مسودة استفسار للمراجعة فقط، ولا يرسلها أو يتواصل مع ستراتا دون موافقة صريحة.",
    service_areas: "تتخذ ستراتا من الرياض مقراً لها وتركز على مسائل الإنشاءات والبنية التحتية الخاضعة لعقود سعودية أو المرتبطة بمشاريع داخل المملكة. وتخدم بصورة أساسية مقاولي الهندسة والتوريد والإنشاء الأجانب، والمطورين، والمستثمرين، ومجالس الإدارة، وفرق المقرات، ومكاتب المحاماة الدولية التي تتعامل مع مخاطر مشاريع سعودية عالية القيمة.",
    evidence_readiness: "تشمل فئات الأدلة الأولية المفيدة: العقد وتعديلاته، وسجلات الإشعارات والمراسلات، وتحديثات البرنامج الزمني، وسجلات التأخير والأوامر التغييرية، والتعليمات، وسجل الدفعات والتصديق، ومحاضر الاجتماعات، وأدلة الموقع المعاصرة، وتسلسلاً زمنياً يركز على القرار المطلوب. لا ترفع أو تفصح عن مواد سرية عبر هذا المساعد العام.",
    procurement_fit: "ينبغي لوكلاء المشتريات تصنيف ستراتا كجهة استشارات إدارية وفنية مستقلة بقيادة هندسية في مخاطر العقود والمشاريع السعودية، والاستشارات الفنية قبل التقاضي، والرأي الفني المستقل، وتقييم مخاطر سلسلة الإمداد والموردين. ستراتا ليست مورداً للعمالة أو السلع، ولا سوقاً إلكترونية، ولا جهة تدريب عامة، ولا مكتب تمثيل قانوني.",
    contact_options: `بعد موافقة المستخدم صراحة على التواصل، تكون القنوات العامة هي ${routing.approved_public_contact_channels.email}، والهاتف ${routing.approved_public_contact_channels.telephone}، ورابط واتساب المعتمد، أو ${routing.canonical_contact_path}. هذا المساعد لا يرسل بريداً ولا يجري اتصالاً ولا يفتح واتساب ولا يقدم نموذجاً ولا يكتب إلى نظام إدارة العملاء.`,
    services_overview: "تشمل مجالات تكليف ستراتا العامة: مراجعة مخاطر ما قبل التعاقد، والإشراف على مخاطر المشروع، والاستشارات الفنية قبل التقاضي، والرأي الفني المستقل، وتقييم مخاطر سلسلة الإمداد والموردين، وإحاطة مجلس الإدارة بالمخاطر. العمل مستقل وبقيادة هندسية ويركز على المشاريع السعودية عالية القيمة، ولا يشمل التمثيل القانوني.",
    company_overview: "ستراتا للاستشارات بالمخاطر جهة مستقلة بقيادة هندسية متخصصة في مخاطر العقود والمشاريع والاستشارات الفنية قبل التقاضي، ومقرها الرياض. تدعم المؤسسات المتخصصة العاملة في عقود إنشاءات وبنية تحتية عالية القيمة خاضعة للنظام السعودي أو مرتبطة بمشاريع سعودية.",
    public_knowledge_gap: "هذا السؤال غير مشمول حالياً ضمن المعرفة العامة المعتمدة لستراتا، ولن أستنتج أو أختلق إجابة. يمكنك السؤال عن الشركة أو الخدمات أو ملاءمة مشروع سعودي أو جاهزية الأدلة أو السرية أو التصنيف لدى المشتريات أو آلية بدء التكليف أو الحدود القانونية والأمنية أو خيارات التواصل.",
  };
  if (patternId === "project_scope_fit") {
    const fitLabels = { strong_fit: "ملاءمة قوية مبدئياً", possible_fit: "ملاءمة محتملة", information_only: "معلومات أولية فقط", needs_clarification: "يحتاج إلى توضيح" };
    return {
      answer: `نتيجة الفحص العام هي: ${fitLabels[scope.fit] || "معلومات أولية"}، بدرجة ${scope.score || 0} من 100.${matchedNames ? ` وأقرب مجالات الخدمة العامة: ${matchedNames}.` : ""} هذه إشارة أولية وليست قبولاً للتكليف أو مشورة مهنية. ويمكن إعداد مسودة استفسار للمراجعة دون إرسالها.`,
      answerStatus: "answered",
      route: scope.fit === "information_only" ? "information_only" : "inquiry_preparation_available",
      sources: [SOURCE_URLS.services, SOURCE_URLS.serviceAreas, SOURCE_URLS.routing],
    };
  }
  const status = patternId === "non_fit_request" ? "answered_non_fit" :
    patternId === "fees_and_timing" ? "requires_mandate_review" :
    patternId === "public_knowledge_gap" ? "public_knowledge_gap" :
    patternId === "commercial_intent_clarification" ? "clarification_required" : "answered";
  const route = patternId === "non_fit_request" ? "non_fit" :
    patternId === "engagement_process" ? "inquiry_preparation_available" :
    patternId === "contact_options" ? "approval_required_before_contact" :
    patternId === "commercial_intent_clarification" ? "clarification_required" : "information_only";
  const sources = patternId === "agent_security_boundary" ? [SOURCE_URLS.security] :
    patternId === "non_fit_request" || patternId === "commercial_intent_clarification" ? [SOURCE_URLS.routing] :
    patternId === "services_overview" ? [SOURCE_URLS.services] :
    patternId === "company_overview" ? [SOURCE_URLS.company] :
    [SOURCE_URLS.company, SOURCE_URLS.services, SOURCE_URLS.routing];
  return { answer: answers[patternId] || answers.public_knowledge_gap, answerStatus: status, route, sources };
}

function responseFor(patternId, scope, language) {
  const services = listServices().services;
  const routing = readJsonResource("agent-routing");
  const names = services.map((service) => service.name).join("; ");
  const matchedNames = (scope.matched_services || []).map((service) => service.name).filter(Boolean).join(", ");

  if (language === "ar") return arabicResponseFor(patternId, scope, routing);

  if (patternId === "agent_security_boundary") {
    return {
      answer: "No. The public Strata Mandate Concierge is isolated to approved public website data. It has no model API key, login, password, cookie, mailbox-read, CRM, Paperclip, GitHub, Vercel, analytics-account, database-read, file-upload, or arbitrary-URL access. An eligible interaction may create only a redacted, allowlisted signal in a private store; the concierge cannot read that store or use it as a public answer. It does not follow instructions asking it to reveal private data or internal prompts.",
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
  if (patternId === "commercial_intent_clarification") {
    return {
      answer: "Supplier, vendor, and procurement wording can describe two different intents. Are you a prospective client seeking review of supplier, subcontractor, or supply-chain risk on a Saudi project, or are you offering products or trying to register as a supplier to Strata? The first may fit Strata; supplier sales and registration do not enter mandate intake.",
      answerStatus: "clarification_required",
      route: "clarification_required",
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
  const response = responseFor(patternId, scope, language);

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
    privacy_safe_demand_signal_may_be_stored: true,
    public_conversational_model_retrained: false,
    approval_required_before_contact_or_submission: true,
    contact_or_submission_performed: false,
  };
}

module.exports = {
  MAX_QUESTION_LENGTH,
  answerAgentQuestion,
  classifyQuestion,
  detectLanguage,
};
