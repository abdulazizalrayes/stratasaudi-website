const { buildDemandRecord } = require("./agent-demand-learning");
const { storeDemandRecord } = require("./agent-demand-store");
const { recordAgentEvent } = require("./agent-observability");

async function recordPrivateDemandInteraction({
  question,
  result,
  messageId = "",
  headers = {},
  interfaceName,
}) {
  const prepared = buildDemandRecord({
    question,
    result,
    messageId,
    headers,
    interfaceName,
  });
  if (process.env.VERCEL_ENV !== "production") {
    await recordAgentEvent("agent_demand_record", {
      user_agent: headers["user-agent"] || "",
      resource_type: "private_demand_learning",
      resource_path: interfaceName,
      demand_classification: prepared.classification,
      demand_record_status: "non_production_excluded",
    });
    return { stored: false, classification: prepared.classification, reason: "Private demand storage runs in production only." };
  }
  if (!prepared.stored) {
    await recordAgentEvent("agent_demand_record", {
      user_agent: headers["user-agent"] || "",
      resource_type: "private_demand_learning",
      resource_path: interfaceName,
      demand_classification: prepared.classification,
      demand_record_status: "excluded",
    });
    return prepared;
  }

  try {
    const storage = await storeDemandRecord(prepared.record);
    await recordAgentEvent("agent_demand_record", {
      user_agent: headers["user-agent"] || "",
      resource_type: "private_demand_learning",
      resource_path: interfaceName,
      demand_classification: prepared.classification,
      demand_record_status: storage.duplicate ? "duplicate" : storage.capped ? "poisoning_cap_excluded" : "stored",
      question_pattern: prepared.record.question_pattern,
      answer_status: prepared.record.answer_status,
      language: prepared.record.language,
      fit: prepared.record.fit,
      route: prepared.record.route,
    });
    return { ...prepared, storage };
  } catch (_error) {
    await recordAgentEvent("agent_demand_record", {
      user_agent: headers["user-agent"] || "",
      resource_type: "private_demand_learning",
      resource_path: interfaceName,
      demand_classification: prepared.classification,
      demand_record_status: "storage_unavailable",
    });
    return { stored: false, classification: prepared.classification, reason: "Private demand storage was unavailable." };
  }
}

module.exports = {
  recordPrivateDemandInteraction,
};
