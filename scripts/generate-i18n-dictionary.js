#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");
const OUTPUT_PATH = path.join(ROOT, "assets", "i18n-dictionary.js");
const CACHE_PATH = path.join(ROOT, "tmp", "i18n-translation-cache.json");
const LANGUAGES = ["ar", "fr", "es", "it", "de"];

const SOURCE_OVERRIDES = {
  "Risk Advisory": {
    ar: "Risk Advisory",
    fr: "Risk Advisory",
    es: "Risk Advisory",
    it: "Risk Advisory",
    de: "Risk Advisory",
  },
  "About": {
    ar: "من نحن",
    fr: "À propos",
    es: "Acerca de",
    it: "Chi siamo",
    de: "Über uns",
  },
  "Insights": {
    ar: "رؤى",
    fr: "Analyses",
    es: "Análisis",
    it: "Approfondimenti",
    de: "Einblicke",
  },
  "Enquire": {
    ar: "استفسار",
    fr: "Demande",
    es: "Consulta",
    it: "Richiedi",
    de: "Anfragen",
  },
  "Clients": {
    ar: "العملاء",
    fr: "Clients",
    es: "Clientes",
    it: "Clienti",
    de: "Kunden",
  },
  "Contract Risk in Saudi Arabia Is Technical Before It Is Legal.": {
    ar: "مخاطر العقود في المملكة العربية السعودية فنية قبل أن تكون قانونية.",
    fr: "Le risque contractuel en Arabie saoudite est d'abord technique avant d'être juridique.",
    es: "El riesgo contractual en Arabia Saudita es técnico antes que jurídico.",
    it: "Il rischio contrattuale in Arabia Saudita è tecnico prima di essere giuridico.",
    de: "Das Vertragsrisiko in Saudi-Arabien ist zuerst technisch, bevor es rechtlich wird.",
  },
  "Understanding FIDIC Claims in Saudi Arabia": {
    ar: "فهم مطالبات FIDIC في المملكة العربية السعودية",
    fr: "Comprendre les réclamations FIDIC en Arabie saoudite",
    es: "Comprender las reclamaciones FIDIC en Arabia Saudita",
    it: "Comprendere le rivendicazioni FIDIC in Arabia Saudita",
    de: "FIDIC-Ansprüche in Saudi-Arabien verstehen",
  },
  "/ Understanding FIDIC Claims in Saudi Arabia": {
    ar: "/ فهم مطالبات FIDIC في المملكة العربية السعودية",
    fr: "/ Comprendre les réclamations FIDIC en Arabie saoudite",
    es: "/ Comprender las reclamaciones FIDIC en Arabia Saudita",
    it: "/ Comprendere le rivendicazioni FIDIC in Arabia Saudita",
    de: "/ FIDIC-Ansprüche in Saudi-Arabien verstehen",
  },
  "Understanding FIDIC Claims in Saudi Arabia: A Contractor's Guide to Risk Management": {
    ar: "فهم مطالبات FIDIC في المملكة العربية السعودية: دليل المقاول لإدارة المخاطر",
    fr: "Comprendre les réclamations FIDIC en Arabie saoudite : guide de gestion des risques pour les entrepreneurs",
    es: "Comprender las reclamaciones FIDIC en Arabia Saudita: guía de gestión de riesgos para contratistas",
    it: "Comprendere le rivendicazioni FIDIC in Arabia Saudita: guida alla gestione del rischio per appaltatori",
    de: "FIDIC-Ansprüche in Saudi-Arabien verstehen: Risikomanagement-Leitfaden für Auftragnehmer",
  },
  "Confidential Enquiry": {
    ar: "استفسار سري",
    fr: "Demande confidentielle",
    es: "Consulta confidencial",
    it: "Richiesta riservata",
    de: "Vertrauliche Anfrage",
  },
  "Confidential Enquiry | Strata Saudi": {
    ar: "استفسار سري | Strata Saudi",
    fr: "Demande confidentielle | Strata Saudi",
    es: "Consulta confidencial | Strata Saudi",
    it: "Richiesta riservata | Strata Saudi",
    de: "Vertrauliche Anfrage | Strata Saudi",
  },
  "Confidential Enquiries": {
    ar: "استفسارات سرية",
    fr: "Demandes confidentielles",
    es: "Consultas confidenciales",
    it: "Richieste riservate",
    de: "Vertrauliche Anfragen",
  },
  "Start confidential enquiry": {
    ar: "ابدأ استفسارًا سريًا",
    fr: "Démarrer une demande confidentielle",
    es: "Iniciar una consulta confidencial",
    it: "Avvia una richiesta riservata",
    de: "Vertrauliche Anfrage starten",
  },
  "FIDIC Claims": {
    ar: "مطالبات FIDIC",
    fr: "Réclamations FIDIC",
    es: "Reclamaciones FIDIC",
    it: "Rivendicazioni FIDIC",
    de: "FIDIC-Ansprüche",
  },
  "FIDIC Claims Saudi Arabia | Strata Risk Advisory": {
    ar: "مطالبات FIDIC في المملكة العربية السعودية | Strata Risk Advisory",
    fr: "Réclamations FIDIC en Arabie saoudite | Strata Risk Advisory",
    es: "Reclamaciones FIDIC en Arabia Saudita | Strata Risk Advisory",
    it: "Rivendicazioni FIDIC in Arabia Saudita | Strata Risk Advisory",
    de: "FIDIC-Ansprüche in Saudi-Arabien | Strata Risk Advisory",
  },
  "Construction Risk & FIDIC Claims Insights": {
    ar: "رؤى حول مخاطر البناء ومطالبات FIDIC",
    fr: "Analyses des risques de construction et des réclamations FIDIC",
    es: "Análisis sobre riesgo de construcción y reclamaciones FIDIC",
    it: "Approfondimenti su rischi di costruzione e rivendicazioni FIDIC",
    de: "Einblicke in Baurisiken und FIDIC-Ansprüche",
  },
  "Contract risk management and FIDIC claims expertise": {
    ar: "إدارة مخاطر العقود وخبرة في مطالبات FIDIC",
    fr: "Gestion des risques contractuels et expertise en réclamations FIDIC",
    es: "Gestión de riesgos contractuales y experiencia en reclamaciones FIDIC",
    it: "Gestione del rischio contrattuale ed esperienza in rivendicazioni FIDIC",
    de: "Vertragsrisikomanagement und Expertise zu FIDIC-Ansprüchen",
  },
  "Claims Management:": {
    ar: "إدارة المطالبات:",
    fr: "Gestion des réclamations :",
    es: "Gestión de reclamaciones:",
    it: "Gestione delle rivendicazioni:",
    de: "Anspruchsmanagement:",
  },
  "Name": {
    ar: "الاسم",
    fr: "Nom",
    es: "Nombre",
    it: "Nome",
    de: "Name",
  },
  "Role": {
    ar: "الدور",
    fr: "Fonction",
    es: "Cargo",
    it: "Ruolo",
    de: "Funktion",
  },
  "Timing:": {
    ar: "التوقيت:",
    fr: "Calendrier :",
    es: "Plazos:",
    it: "Tempistiche:",
    de: "Zeitplan:",
  },
  "Documentation:": {
    ar: "التوثيق:",
    fr: "Documentation :",
    es: "Documentación:",
    it: "Documentazione:",
    de: "Dokumentation:",
  },
  "Claims are only as strong as the supporting documentation. Many contractors focus on daily work execution and fail to contemporaneously record delays, variations, and changed circumstances. When a dispute arises months or years later, reconstructing events from memory is unreliable and unconvincing to arbitrators. Saudi mega-projects with thousands of workers and multiple shifting priorities make meticulous documentation even more critical.": {
    ar: "تعتمد قوة المطالبات على قوة الوثائق الداعمة. يركز العديد من المقاولين على التنفيذ اليومي للأعمال ولا يوثقون التأخيرات والتغييرات والظروف المتبدلة في وقتها. وعندما ينشأ النزاع بعد أشهر أو سنوات، تكون إعادة بناء الأحداث من الذاكرة غير موثوقة وغير مقنعة للمحكمين. لذلك تصبح الدقة في التوثيق أكثر أهمية في المشاريع السعودية العملاقة ذات آلاف العاملين والأولويات المتغيرة.",
    fr: "La solidité d'une réclamation dépend de la qualité de sa documentation. De nombreux entrepreneurs se concentrent sur l'exécution quotidienne et ne consignent pas en temps réel les retards, variations et changements de circonstances. Lorsqu'un différend survient des mois ou des années plus tard, reconstituer les faits de mémoire est peu fiable et peu convaincant pour les arbitres. Dans les mégaprojets saoudiens, avec des milliers de travailleurs et des priorités multiples, une documentation rigoureuse devient encore plus critique.",
    es: "La solidez de una reclamación depende de la documentación que la respalda. Muchos contratistas se concentran en la ejecución diaria y no registran contemporáneamente los retrasos, las variaciones y los cambios de circunstancias. Cuando surge una disputa meses o años después, reconstruir los hechos de memoria resulta poco fiable y poco convincente para los árbitros. En los megaproyectos saudíes, con miles de trabajadores y prioridades cambiantes, la documentación meticulosa es aún más crítica.",
    it: "La solidità di una rivendicazione dipende dalla documentazione che la supporta. Molti appaltatori si concentrano sull'esecuzione quotidiana e non registrano tempestivamente ritardi, variazioni e mutamenti delle circostanze. Quando una controversia nasce mesi o anni dopo, ricostruire gli eventi a memoria è poco affidabile e poco convincente per gli arbitri. Nei megaprogetti sauditi, con migliaia di lavoratori e priorità mutevoli, una documentazione rigorosa è ancora più critica.",
    de: "Die Stärke eines Anspruchs hängt von der Qualität der unterstützenden Dokumentation ab. Viele Auftragnehmer konzentrieren sich auf die tägliche Ausführung und erfassen Verzögerungen, Änderungen und veränderte Umstände nicht zeitnah. Wenn Monate oder Jahre später eine Streitigkeit entsteht, ist eine Rekonstruktion aus dem Gedächtnis unzuverlässig und für Schiedsrichter wenig überzeugend. Bei saudischen Megaprojekten mit Tausenden von Arbeitskräften und wechselnden Prioritäten ist sorgfältige Dokumentation noch wichtiger.",
  },
  "We do not replace legal counsel. We provide the technical foundation they would not otherwise have.": {
    ar: "نحن لا نستبدل المستشار القانوني. بل نوفر الأساس الفني الذي قد لا يتوافر لديه من دوننا.",
    fr: "Nous ne remplaçons pas les conseils juridiques. Nous apportons le socle technique dont ils ne disposent pas toujours.",
    es: "No sustituimos al asesor legal. Proporcionamos la base técnica que de otro modo no tendría.",
    it: "Non sostituiamo il consulente legale. Forniamo il fondamento tecnico che altrimenti potrebbe mancare.",
    de: "Wir ersetzen keinen Rechtsbeistand. Wir liefern die technische Grundlage, die sonst oft fehlen würde.",
  },
};

const EXTRA_STRINGS = [
  "Home",
  "About",
  "Mandates",
  "Counterparties",
  "Risk Landscape",
  "Risk landscape",
  "Insights",
  "FAQ",
  "Confidential Enquiry",
  "Open navigation",
  "Request advisory review",
  "Engineering-led risk advisory",
  "Selective advisory for Saudi project exposure",
  "Independent technical advisory for contract risk, project risk, dispute-readiness, and premium mandate structuring in the Kingdom of Saudi Arabia.",
  "LinkedIn",
  "Practice",
  "Mandate lines",
  "Target counterparties",
  "Authority",
  "Insights hub",
  "Governance",
  "Company",
  "Privacy",
  "Terms",
  "Riyadh, Saudi Arabia",
  "Submitting securely...",
  "Unable to send enquiry.",
  "Language selector",
];

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&copy;/g, "©")
    .replace(/&middot;/g, "·")
    .replace(/&rarr;/g, "→")
    .replace(/&nbsp;/g, " ");
}

function cleanHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
}

function normalize(value) {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

function isTranslatable(value) {
  const source = normalize(value);
  if (!source) return false;
  if (/^[\d\s.,:+/()$%-]+$/.test(source)) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source)) return false;
  if (/^https?:\/\//i.test(source)) return false;
  return /[A-Za-z\u0600-\u06ff]/.test(source);
}

function extractText(html) {
  const clean = cleanHtml(html);
  const values = [];
  const textPattern = />\s*([^<>]*?\S[^<>]*?)\s*</g;
  const attributePattern = /\s(?:placeholder|aria-label|title|alt)=["']([^"']*?[A-Za-z][^"']*?)["']/gi;
  const metaContentPattern =
    /<meta\b(?=[^>]*(?:name|property)=["'](?:description|og:title|og:description|twitter:title|twitter:description)["'])(?=[^>]*content=["']([^"']*?[A-Za-z][^"']*?)["'])[^>]*>/gi;
  let match;

  while ((match = textPattern.exec(clean))) values.push(normalize(match[1]));
  while ((match = attributePattern.exec(clean))) values.push(normalize(match[1]));
  while ((match = metaContentPattern.exec(clean))) values.push(normalize(match[1]));

  return values.filter(isTranslatable);
}

function readSources() {
  const values = [];
  for (const file of fs.readdirSync(SITE_DIR).filter((name) => name.endsWith(".html"))) {
    values.push(...extractText(fs.readFileSync(path.join(SITE_DIR, file), "utf8")));
  }
  values.push(...EXTRA_STRINGS);
  return [...new Set(values.map(normalize).filter(isTranslatable))].sort((a, b) => a.localeCompare(b));
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch (_error) {
    return {};
  }
}

function writeCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
}

function protectBrandTerms(value) {
  const terms = [
    "Strata Saudi",
    "Strata Risk Advisory",
    "Strata",
    "Fédération Internationale des Ingénieurs-Conseils",
    "FIDIC",
    "NEOM",
    "The Line",
    "Trojena",
    "Oxagon",
    "Red Sea Project",
    "Vision 2030",
    "OpenCode",
    "Codex",
    "Claude Code",
    "Paperclip",
    "RevOps",
    "GTM",
    "GA4",
    "DAB",
    "ICC",
    "LCIA",
    "CPM",
    "SAR",
    "USD",
  ];
  const placeholders = [];
  let output = value;
  terms.forEach((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(escaped, "g"), () => {
      const placeholder = `__STRATA_PH_${placeholders.length}__`;
      placeholders.push(term);
      return placeholder;
    });
  });
  return { output, placeholders };
}

function restoreBrandTerms(value, placeholders) {
  let output = value;
  placeholders.forEach((term, index) => {
    output = output.replace(new RegExp(`__\\s*STRATA\\s*_?\\s*PH\\s*_?\\s*${index}\\s*__`, "gi"), term);
    output = output.replace(new RegExp(`__STRATA_PH_${index}__`, "g"), term);
  });
  return output;
}

function polishTranslation(value, language, source) {
  if (
    source ===
    "The Fédération Internationale des Ingénieurs-Conseils (FIDIC) contract forms have become the global standard for construction projects, and Saudi Arabia is no exception. As the Kingdom accelerates its mega-projects under Vision 2030, from NEOM and The Line to the Red Sea Project, contractors operating in Saudi Arabia must understand the intricacies of FIDIC claims and risk management. These contracts are complex, often comprising hundreds of pages of technical and legal provisions, with subtle clauses that can significantly impact project outcomes and profitability."
  ) {
    return {
      ar: "أصبحت نماذج عقود Fédération Internationale des Ingénieurs-Conseils (FIDIC) معيارًا عالميًا لمشاريع البناء، والمملكة العربية السعودية ليست استثناءً. ومع تسريع المملكة لمشاريعها العملاقة ضمن Vision 2030، من NEOM وThe Line إلى Red Sea Project، يجب على المقاولين العاملين في المملكة العربية السعودية فهم تعقيدات مطالبات FIDIC وإدارة المخاطر. فهذه العقود معقدة، وغالبًا ما تضم مئات الصفحات من الأحكام الفنية والقانونية، مع بنود دقيقة قد تؤثر بشكل كبير في نتائج المشروع وربحيته.",
      fr: "Les formulaires contractuels de la Fédération Internationale des Ingénieurs-Conseils (FIDIC) sont devenus la référence mondiale pour les projets de construction, et l'Arabie saoudite ne fait pas exception. Alors que le Royaume accélère ses mégaprojets dans le cadre de Vision 2030, de NEOM et The Line à Red Sea Project, les entrepreneurs opérant en Arabie saoudite doivent comprendre les mécanismes des réclamations FIDIC et de la gestion des risques. Ces contrats sont complexes, souvent composés de centaines de pages de dispositions techniques et juridiques, avec des clauses subtiles qui peuvent avoir un impact significatif sur les résultats et la rentabilité du projet.",
      es: "Los modelos contractuales de la Fédération Internationale des Ingénieurs-Conseils (FIDIC) se han convertido en la referencia mundial para los proyectos de construcción, y Arabia Saudita no es una excepción. A medida que el Reino acelera sus megaproyectos bajo Vision 2030, desde NEOM y The Line hasta Red Sea Project, los contratistas que operan en Arabia Saudita deben comprender los mecanismos de las reclamaciones FIDIC y de la gestión de riesgos. Estos contratos son complejos y suelen incluir cientos de páginas de disposiciones técnicas y jurídicas, con cláusulas sutiles que pueden afectar de forma significativa los resultados y la rentabilidad del proyecto.",
      it: "I modelli contrattuali della Fédération Internationale des Ingénieurs-Conseils (FIDIC) sono diventati il riferimento mondiale per i progetti di costruzione, e l'Arabia Saudita non fa eccezione. Mentre il Regno accelera i suoi megaprogetti nell'ambito di Vision 2030, da NEOM e The Line a Red Sea Project, gli appaltatori che operano in Arabia Saudita devono comprendere i meccanismi delle rivendicazioni FIDIC e della gestione del rischio. Questi contratti sono complessi, spesso composti da centinaia di pagine di disposizioni tecniche e giuridiche, con clausole sottili che possono incidere in modo significativo sui risultati e sulla redditività del progetto.",
      de: "Die Vertragsmuster der Fédération Internationale des Ingénieurs-Conseils (FIDIC) sind zum weltweiten Standard für Bauprojekte geworden, und Saudi-Arabien bildet keine Ausnahme. Während das Königreich seine Megaprojekte im Rahmen von Vision 2030 beschleunigt, von NEOM und The Line bis Red Sea Project, müssen Auftragnehmer in Saudi-Arabien die Mechanismen von FIDIC-Ansprüchen und Risikomanagement verstehen. Diese Verträge sind komplex und umfassen oft Hunderte Seiten technischer und rechtlicher Bestimmungen mit subtilen Klauseln, die Projektergebnisse und Rentabilität erheblich beeinflussen können.",
    }[language];
  }
  if (SOURCE_OVERRIDES[source] && SOURCE_OVERRIDES[source][language]) {
    return SOURCE_OVERRIDES[source][language];
  }
  let output = value.replace(/\s+/g, " ").trim();
  output = output
    .replace(/Strata Saudi/g, "Strata Saudi")
    .replace(/Strata Risk Advisory/g, "Strata Risk Advisory")
    .replace(/Fidic/g, "FIDIC")
    .replace(/Neom/g, "NEOM")
    .replace(/Dab/g, "DAB")
    .replace(/Gtm/g, "GTM")
    .replace(/Ga4/g, "GA4");
  if (language === "fr") {
    output = output
      .replace(/Arabie Saoudite/g, "Arabie saoudite")
      .replace(/Enquête confidentielle/g, "Demande confidentielle")
      .replace(/enquête confidentielle/g, "demande confidentielle")
      .replace(/enquêtes confidentielles/g, "demandes confidentielles")
      .replace(/Conseiller à l'international/g, "Conseil international")
      .replace(/sinistres FIDIC/g, "réclamations FIDIC")
      .replace(/reconstituer les sinistres/g, "reconstituer les réclamations")
      .replace(/FIDIC sinistres/g, "réclamations FIDIC")
      .replace(/FIDIC Réclamations/g, "Réclamations FIDIC")
      .replace(/FIDIC réclamations/g, "réclamations FIDIC")
      .replace(/Réclamations Arabie saoudite/g, "Réclamations en Arabie saoudite")
      .replace(/réclamations Arabie saoudite/g, "réclamations en Arabie saoudite")
      .replace(/accords gouvernés par l'Arabie saoudite/g, "accords régis par le droit saoudien")
      .replace(/contrats gouvernés par l'Arabie saoudite/g, "contrats régis par le droit saoudien")
      .replace(/contrats régis par l'Arabie saoudite/g, "contrats régis par le droit saoudien")
      .replace(/entreprises opérant dans le cadre de contrats régis par l'Arabie saoudite/g, "entreprises opérant dans le cadre de contrats régis par le droit saoudien")
      .replace(/préavis contractuel/g, "notifications contractuelles")
      .replace(/exigences en matière de préavis/g, "exigences de notification")
      .replace(/Délais de préavis manqués/g, "Délais de notification manqués")
      .replace(/Période de préavis/g, "Délai de notification")
      .replace(/préavis inadéquat/g, "notification inadéquate")
      .replace(/un préavis lorsqu'un événement/g, "une notification lorsqu'un événement")
      .replace(/signifier un préavis/g, "notifier")
      .replace(/donner un avis de réclamations potentielles/g, "notifier les réclamations potentielles")
      .replace(/exigences strictes en matière de préavis/g, "exigences strictes de notification")
      .replace(/exigences de préavis de procédure/g, "exigences procédurales de notification")
      .replace(/représentation légale/g, "représentation juridique")
      .replace(/avant d’être légal/g, "avant d’être juridique");
  }
  if (language === "es") {
    output = output
      .replace(/FIDIC Reclamaciones/g, "Reclamaciones FIDIC")
      .replace(/FIDIC reclamaciones/g, "reclamaciones FIDIC")
      .replace(/FIDIC reclamos contractuales/g, "reclamaciones contractuales FIDIC")
      .replace(/FIDIC reclamos/g, "reclamaciones FIDIC")
      .replace(/reclamos/g, "reclamaciones")
      .replace(/Reclamos/g, "Reclamaciones")
      .replace(/Los reclamaciones/g, "Las reclamaciones")
      .replace(/los reclamaciones/g, "las reclamaciones")
      .replace(/los posibles reclamaciones/g, "las posibles reclamaciones")
      .replace(/el reclamo en sí/g, "la reclamación en sí")
      .replace(/un reclamo/g, "una reclamación")
      .replace(/presentar un reclamo/g, "presentar una reclamación")
      .replace(/comprender reclamaciones FIDIC/g, "comprender las reclamaciones FIDIC")
      .replace(/Las afirmaciones son/g, "Las reclamaciones son")
      .replace(/contratos gobernados por Arabia Saudita/g, "contratos regidos por la legislación saudí")
      .replace(/contratos complejos gobernados por Arabia Saudita/g, "contratos complejos regidos por la legislación saudí")
      .replace(/contratos regidos por Arabia Saudita/g, "contratos regidos por la legislación saudí")
      .replace(/acuerdos regidos por Arabia Saudita/g, "acuerdos regidos por la legislación saudí")
      .replace(/Riesgo de construcción y FIDIC Información sobre reclamaciones/g, "Riesgo de construcción e información sobre reclamaciones FIDIC")
      .replace(/Pregunta sobre nuestros servicios/g, "Consulta sobre nuestros servicios");
  }
  if (language === "it") {
    output = output
      .replace(/sinistri FIDIC/g, "rivendicazioni FIDIC")
      .replace(/Sinistri FIDIC/g, "Rivendicazioni FIDIC")
      .replace(/FIDIC Reclami/g, "Reclami FIDIC")
      .replace(/FIDIC reclami/g, "reclami FIDIC")
      .replace(/FIDIC rivendicazioni/g, "rivendicazioni FIDIC")
      .replace(/dei rivendicazioni/g, "delle rivendicazioni")
      .replace(/del rivendicazioni/g, "delle rivendicazioni")
      .replace(/i rivendicazioni/g, "le rivendicazioni")
      .replace(/I rivendicazioni/g, "Le rivendicazioni")
      .replace(/FIDIC Rivendica l'Arabia Saudita/g, "Rivendicazioni FIDIC in Arabia Saudita")
      .replace(/Informazioni sulle FIDIC rivendicazioni/g, "Comprendere le rivendicazioni FIDIC")
      .replace(/Le affermazioni sono/g, "Le rivendicazioni sono")
      .replace(/Gestione dei sinistri/g, "Gestione delle rivendicazioni")
      .replace(/posizione relativa ai sinistri/g, "posizione sulle rivendicazioni")
      .replace(/contratti governati dall'Arabia Saudita/g, "contratti regolati dal diritto saudita")
      .replace(/contratti regolamentati dall'Arabia Saudita/g, "contratti regolati dal diritto saudita")
      .replace(/accordi governati dall’Arabia Saudita/g, "accordi regolati dal diritto saudita")
      .replace(/società internazionali che operano con contratti governati dall'Arabia Saudita/g, "società internazionali che operano con contratti regolati dal diritto saudita");
  }
  if (language === "de") {
    output = output
      .replace(/FIDIC Schadensexpertise/g, "Expertise zu FIDIC-Ansprüchen")
      .replace(/FIDIC Schadensanalyse/g, "Analyse von FIDIC-Ansprüchen")
      .replace(/FIDIC Schadensersatzansprüche/g, "FIDIC-Ansprüche")
      .replace(/FIDIC Schadensfälle/g, "FIDIC-Ansprüche")
      .replace(/FIDIC Schadensfälle/g, "FIDIC-Ansprüche")
      .replace(/FIDIC Ansprüche/g, "FIDIC-Ansprüche")
      .replace(/Schadenmanagement/g, "Anspruchsmanagement")
      .replace(/Schadensmanagement/g, "Anspruchsmanagement")
      .replace(/Schadensfälle/g, "Ansprüche")
      .replace(/Schadensanalyse/g, "Analyse von Ansprüchen")
      .replace(/Schadensrisiken/g, "Anspruchsrisiken")
      .replace(/Schadenslage/g, "Anspruchsposition")
      .replace(/Schadenverfahren/g, "Anspruchsverfahren")
      .replace(/Schaden- und Risikomanagement von FIDIC/g, "FIDIC-Anspruchs- und Risikomanagement")
      .replace(/Schadensfall/g, "Anspruchsfall")
      .replace(/Schadensursachen/g, "Ursachen")
      .replace(/legal ist/g, "rechtlich wird")
      .replace(/vertragliche Kündigungsdisziplin/g, "Disziplin bei vertraglichen Mitteilungen")
      .replace(/Klageeinreichung/g, "Einreichung des Anspruchs")
      .replace(/gegenüber der Schlichtung/g, "gegenüber dem Schiedsverfahren")
      .replace(/von Saudi-Arabien verwalteter Verträge/g, "dem saudi-arabischen Recht unterstehenden Verträge")
      .replace(/von Saudi-Arabien verwalteten Vereinbarungen/g, "dem saudi-arabischen Recht unterstehenden Vereinbarungen")
      .replace(/von in Saudi-Arabien geregelten Verträgen/g, "von dem saudi-arabischen Recht unterstehenden Verträgen")
      .replace(/in Saudi-Arabien geregelten Verträgen/g, "dem saudi-arabischen Recht unterstehenden Verträgen")
      .replace(/in Saudi-Arabien verwalteten Verträgen/g, "dem saudi-arabischen Recht unterstehenden Verträgen")
      .replace(/Erkundigen Sie sich nach unseren Dienstleistungen/g, "Anfrage zu unseren Leistungen");
  }
  if (language === "ar") {
    output = output
      .replace(/مؤتمن/g, "سري")
      .replace(/تحقيق سري/g, "استفسار سري")
      .replace(/إجراء تحقيق سري/g, "استقبال استفسار سري")
      .replace(/FIDIC المطالبات/g, "مطالبات FIDIC")
      .replace(/المطالبات FIDIC/g, "مطالبات FIDIC")
      .replace(/FIDIC تحليل المطالبات/g, "تحليل مطالبات FIDIC")
      .replace(/تأخير المطالبات/g, "مطالبات التأخير")
      .replace(/خبرة FIDIC/g, "خبرة في مطالبات FIDIC")
      .replace(/و FIDIC رؤى المطالبات/g, "ورؤى مطالبات FIDIC")
      .replace(/ولايات سرية/g, "تكليفات سرية")
      .replace(/مجلس التحكيم في المنازعات/g, "مجلس فض المنازعات")
      .replace(/العقود المعقدة التي تحكمها الحكومة السعودية/g, "العقود المعقدة الخاضعة للقانون السعودي")
      .replace(/عقود تحكمها المملكة العربية السعودية/g, "عقود خاضعة للقانون السعودي")
      .replace(/عقود تحكمها السعودية/g, "عقود خاضعة للقانون السعودي")
      .replace(/العقود التي تحكمها المملكة العربية السعودية/g, "العقود الخاضعة للقانون السعودي")
      .replace(/الاتفاقيات التي تحكمها المملكة العربية السعودية/g, "الاتفاقيات الخاضعة للقانون السعودي")
      .replace(/الذخيرة التقنية/g, "الدعم الفني الدقيق");
  }
  return output;
}

async function translate(source, language, cache) {
  cache[language] = cache[language] || {};
  if (cache[language][source]) {
    const polished = polishTranslation(cache[language][source], language, source);
    cache[language][source] = polished;
    return polished;
  }

  const protectedSource = protectBrandTerms(source);
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
    encodeURIComponent(language) +
    "&dt=t&q=" +
    encodeURIComponent(protectedSource.output);

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const body = await response.json();
      const translated = (body[0] || []).map((part) => part[0]).join("");
      const restored = polishTranslation(restoreBrandTerms(translated, protectedSource.placeholders), language, source);
      cache[language][source] = restored;
      return restored;
    } catch (error) {
      if (attempt === 4) throw new Error(`Failed to translate "${source}" to ${language}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
    }
  }
}

async function translateLanguage(language, sources, cache) {
  const entries = {};
  let index = 0;
  const concurrency = 8;
  async function worker() {
    while (index < sources.length) {
      const source = sources[index];
      index += 1;
      entries[source] = await translate(source, language, cache);
      if (index % 50 === 0) {
        process.stderr.write(`${language}: ${index}/${sources.length}\n`);
        writeCache(cache);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  writeCache(cache);
  return entries;
}

async function main() {
  const sources = readSources();
  const cache = readCache();
  const dictionary = {};

  for (const language of LANGUAGES) {
    process.stderr.write(`Translating ${sources.length} strings to ${language}\n`);
    dictionary[language] = await translateLanguage(language, sources, cache);
  }

  const payload = `window.StrataI18nDictionary = ${JSON.stringify(dictionary, null, 2)};\n`;
  fs.writeFileSync(OUTPUT_PATH, payload);
  console.log(JSON.stringify({ ok: true, output: OUTPUT_PATH, sources: sources.length }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
