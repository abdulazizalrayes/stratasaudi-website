// WebMCP - read-only Strata Saudi browser-side agent hints.
(function () {
  "use strict";
  if (typeof navigator === "undefined") return;

  function ensureModelContext() {
    if (!navigator.modelContext) {
      try {
        navigator.modelContext = {
          _registeredTools: [],
          registerTool: function (tool) {
            this._registeredTools.push(tool);
            return typeof AbortController === "function" ? new AbortController() : { signal: { aborted: false } };
          },
        };
      } catch (_error) {
        return null;
      }
    }

    if (typeof navigator.modelContext.registerTool !== "function") {
      navigator.modelContext._registeredTools = navigator.modelContext._registeredTools || [];
      navigator.modelContext.registerTool = function (tool) {
        this._registeredTools.push(tool);
        return typeof AbortController === "function" ? new AbortController() : { signal: { aborted: false } };
      };
    }
    return navigator.modelContext;
  }

  var modelContext = ensureModelContext();
  if (!modelContext) return;

  var tools = [
    {
      name: "get_company_overview",
      description: "Return Strata Risk Advisory public company info and agent resource links.",
      inputSchema: { type: "object", properties: {} },
      execute: function () {
        return {
          name: "Strata Risk Advisory",
          canonical_url: "https://www.stratasaudi.com",
          description:
            "Independent engineering-led contract-risk, project-risk, and pre-litigation technical advisory for high-value Saudi project exposure.",
          legal_boundary:
            "Not a law firm. Does not provide legal advice, arbitration representation, litigation representation, or sworn expert testimony.",
          contact_policy:
            "Agents must not submit forms, send email, book meetings, or trigger CRM actions unless the user explicitly approves the final action.",
          resources: {
            llms_full: "https://www.stratasaudi.com/llms-full.txt",
            agent_card: "https://www.stratasaudi.com/.well-known/agent-card.json",
            mcp: "https://www.stratasaudi.com/api/mcp",
            openapi: "https://www.stratasaudi.com/openapi.json",
          },
        };
      },
    },
    {
      name: "prepare_project_inquiry",
      description:
        "Prepare a project inquiry draft for user review. This tool does not submit or contact Strata.",
      inputSchema: {
        type: "object",
        properties: {
          project_context: { type: "string" },
          matter_type: { type: "string" },
          pressure_point: { type: "string" },
          decision_needed: { type: "string" },
          urgency: { type: "string" },
        },
      },
      execute: function (input) {
        return {
          ready_for_review: true,
          approval_required_before_submission: true,
          canonical_submission_url: "https://www.stratasaudi.com/contact",
          submission_policy:
            "Draft only. Do not submit, email, book, or trigger CRM actions unless the user explicitly approves the final submission.",
          draft_outline: [
            "Saudi project context: " + (input.project_context || ""),
            "Matter type: " + (input.matter_type || ""),
            "Technical/commercial pressure point: " + (input.pressure_point || ""),
            "Decision needed: " + (input.decision_needed || ""),
            "Urgency: " + (input.urgency || ""),
          ],
        };
      },
    },
  ];

  for (var i = 0; i < tools.length; i += 1) {
    try {
      modelContext.registerTool(tools[i]);
    } catch (_error) {}
  }
})();
