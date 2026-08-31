#!/usr/bin/env node

const { execFileSync } = require("child_process");
const { getPaperclipBaseUrl } = require("./lib/paperclip-base-url");
const { requestViaChromeSession } = require("./lib/paperclip-chrome-session");

const BASE_URL = getPaperclipBaseUrl();
const COMPANY_ID =
  process.env.PAPERCLIP_COMPANY_ID || "9ff6f561-3790-444f-87c8-89cb0911775b";
const PAPERCLIP_EXECUTION_CWD =
  process.env.PAPERCLIP_EXECUTION_CWD ||
  process.env.STRATA_PAPERCLIP_EXECUTION_CWD ||
  "/home/paperclip/.paperclip/instances/default/projects/9ff6f561-3790-444f-87c8-89cb0911775b/53acb115-e136-414d-af1b-0c2bfb6d966f/_default";
const OPENCODE_MAIN_MODEL = "opencode/big-pickle";
const OPENCODE_HELPER_MODEL = "opencode/deepseek-v4-flash-free";
const URL_MATCH = process.env.PAPERCLIP_CHROME_URL_MATCH || "ai.eijarat.com";
const APPLY = process.argv.includes("--apply");
const COMPACT = process.argv.includes("--compact");

const OPEN_STATUSES = new Set(["todo", "in_progress", "blocked", "backlog"]);
const GENERATED_REVIEW_ORIGINS = new Set([
  "stale_active_run_evaluation",
  "issue_productivity_review",
  "stranded_issue_recovery",
]);

function parseJson(text, label) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    const preview = String(text || "").slice(0, 240);
    throw new Error(`Expected JSON from ${label}, received: ${preview}`);
  }
}

function requestJson(path, options = {}) {
  const body =
    options.body === undefined || options.body === null
      ? null
      : JSON.stringify(options.body);
  const response = requestViaChromeSession({
    method: options.method || "GET",
    url: `${BASE_URL}${path}`,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body,
    urlMatch: URL_MATCH,
  });
  const parsed = parseJson(response.text, path);
  if (response.status < 200 || response.status >= 300) {
    const error = new Error(`${options.method || "GET"} ${path} failed: ${response.status}`);
    error.body = parsed;
    throw error;
  }
  return parsed;
}

function executeChromeJavascript(jsPayload) {
  const appleScript = `
    on run argv
      set urlMatch to item 1 of argv
      set jsPayload to item 2 of argv
      tell application "Google Chrome"
        set targetTab to missing value
        try
          set frontTab to active tab of front window
          if (URL of frontTab) contains urlMatch then set targetTab to frontTab
        end try
        if targetTab is missing value then
          repeat with windowIndex from 1 to count of windows
            set candidateWindow to window windowIndex
            set tabCount to count of tabs of candidateWindow
            repeat with tabIndex from 1 to tabCount
              try
                set candidateTab to tab tabIndex of candidateWindow
                if (URL of candidateTab) contains urlMatch then
                  set targetTab to candidateTab
                  exit repeat
                end if
              end try
            end repeat
            if targetTab is not missing value then exit repeat
          end repeat
        end if
        if targetTab is missing value then error "No Chrome tab matched " & urlMatch
        return execute targetTab javascript jsPayload
      end tell
    end run
  `.trim();

  const stdout = execFileSync("osascript", ["-e", appleScript, URL_MATCH, jsPayload], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  }).trim();
  const parsed = parseJson(stdout, "chrome batch execution");
  if (!parsed.ok) {
    const error = new Error(parsed.error || "Chrome batch execution failed");
    error.body = parsed;
    throw error;
  }
  return parsed;
}

function buildOperation(label, method, path, body) {
  return {
    label,
    method,
    url: `${BASE_URL}${path}`,
    body: body === undefined ? null : body,
  };
}

function batchMutate(operations, chunkSize = 50) {
  const results = [];
  for (let start = 0; start < operations.length; start += chunkSize) {
    const chunk = operations.slice(start, start + chunkSize);
    const browserPayload = `
      (function () {
        try {
          var operations = ${JSON.stringify(chunk)};
          var results = [];
          for (var i = 0; i < operations.length; i += 1) {
            var op = operations[i];
            try {
              var xhr = new XMLHttpRequest();
              xhr.open(op.method, op.url, false);
              xhr.setRequestHeader("Content-Type", "application/json");
              xhr.send(op.body === null ? null : JSON.stringify(op.body));
              var responseBody = null;
              if (xhr.responseText) {
                try {
                  responseBody = JSON.parse(xhr.responseText);
                } catch (parseError) {
                  responseBody = { rawPreview: String(xhr.responseText).slice(0, 240) };
                }
              }
              results.push({
                label: op.label,
                ok: xhr.status >= 200 && xhr.status < 300,
                status: xhr.status,
                statusText: xhr.statusText,
                body: responseBody && typeof responseBody === "object"
                  ? {
                      id: responseBody.id || null,
                      identifier: responseBody.identifier || null,
                      name: responseBody.name || null,
                      status: responseBody.status || null,
                      error: responseBody.error || null
                    }
                  : responseBody
              });
            } catch (error) {
              results.push({
                label: op.label,
                ok: false,
                status: 0,
                statusText: "client_error",
                error: String(error)
              });
            }
          }
          return JSON.stringify({ ok: true, results: results });
        } catch (error) {
          return JSON.stringify({
            ok: false,
            error: String(error),
            stack: error && error.stack ? String(error.stack) : null
          });
        }
      })();
    `.trim();
    const response = executeChromeJavascript(browserPayload);
    results.push(...response.results);
    process.stderr.write(
      `Applied batch ${Math.floor(start / chunkSize) + 1}/${Math.ceil(operations.length / chunkSize)} (${results.length}/${operations.length})\n`,
    );
  }
  return results;
}

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function isOpen(issue) {
  return OPEN_STATUSES.has(issue.status);
}

function isManualSelfTest(issue) {
  return (
    issue.identifier === "STR-31" ||
    issue.identifier === "STR-32" ||
    issue.title === "Self-test: assignment/watch flow" ||
    issue.title === "STR-31 Subtask: API smoke test"
  );
}

function compareIssueFreshness(a, b) {
  const updated = Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0);
  if (updated !== 0) return updated;
  return (b.issueNumber || 0) - (a.issueNumber || 0);
}

function compareRoutineCurrency(a, b) {
  const statusRank = { in_progress: 3, todo: 2, blocked: 1, backlog: 0 };
  const rank = (statusRank[b.status] || 0) - (statusRank[a.status] || 0);
  if (rank !== 0) return rank;
  const issueNumber = (b.issueNumber || 0) - (a.issueNumber || 0);
  if (issueNumber !== 0) return issueNumber;
  return Date.parse(b.createdAt || b.updatedAt || 0) - Date.parse(a.createdAt || a.updatedAt || 0);
}

function summarizeIssue(issue) {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    status: issue.status,
    originKind: issue.originKind,
    assigneeAgentId: issue.assigneeAgentId || null,
    updatedAt: issue.updatedAt,
  };
}

function summarizeAgent(agent) {
  return {
    id: agent.id,
    name: agent.name,
    status: agent.status,
    adapterType: agent.adapterType,
    model: agent.adapterConfig && agent.adapterConfig.model,
    variant: agent.adapterConfig && agent.adapterConfig.variant,
    registryId: agent.metadata && agent.metadata.registryId,
  };
}

function summarizeRun(run) {
  return {
    id: run.id,
    agentId: run.agentId,
    status: run.status,
    invocationSource: run.invocationSource,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    lastOutputAt: run.lastOutputAt,
    errorCode: run.errorCode,
    issueId: run.contextSnapshot && (run.contextSnapshot.issueId || run.contextSnapshot.taskId),
  };
}

function desiredModelForAgent(agent) {
  const lane =
    agent &&
    agent.metadata &&
    agent.metadata.governance &&
    agent.metadata.governance.lane;
  return lane === "cheap" ? OPENCODE_HELPER_MODEL : OPENCODE_MAIN_MODEL;
}

function buildAgentPatch(agent) {
  const existingMetadata = agent.metadata || {};
  const existingGovernance = existingMetadata.governance || {};
  const existingConfig = agent.adapterConfig || {};
  const desiredModel = desiredModelForAgent(agent);
  const primaryAdapter = existingMetadata.primaryAdapter || agent.adapterType || "unknown";
  const primaryProviderModel =
    existingMetadata.primaryProviderModel ||
    existingGovernance.providerModel ||
    existingConfig.model ||
    "unknown";
  return {
    adapterType: "opencode_local",
    adapterConfig: {
      ...existingConfig,
      cwd: PAPERCLIP_EXECUTION_CWD,
      command: "opencode",
      model: desiredModel,
      variant: existingConfig.variant || "medium",
      dangerouslySkipPermissions: true,
    },
    metadata: {
      ...existingMetadata,
      primaryAdapter,
      primaryProviderModel,
      failoverMode: "cloud_runtime_recovery",
      failoverActivatedAt: new Date().toISOString(),
      failoverReason: "Premium adapter environment unavailable in cloud runtime",
      governance: {
        ...existingGovernance,
        adapter: "opencode_local",
        providerModel: desiredModel,
      },
    },
  };
}

function classifyIssues(issues) {
  const openIssues = issues.filter(isOpen);
  const generatedReviewIssues = openIssues
    .filter((issue) => GENERATED_REVIEW_ORIGINS.has(issue.originKind))
    .map(summarizeIssue);
  const manualSelfTests = openIssues.filter(isManualSelfTest).map(summarizeIssue);

  const blockedRoutineIssues = openIssues.filter(
    (issue) => issue.status === "blocked" && issue.originKind === "routine_execution",
  );
  const grouped = new Map();
  for (const issue of blockedRoutineIssues) {
    const key = issue.title || issue.id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(issue);
  }

  const routineReopen = [];
  const routineClose = [];
  for (const group of grouped.values()) {
    const sorted = [...group].sort(compareIssueFreshness);
    const [freshest, ...stale] = sorted;
    if (freshest) routineReopen.push(summarizeIssue(freshest));
    routineClose.push(...stale.map(summarizeIssue));
  }

  const routineGroups = new Map();
  for (const issue of openIssues.filter((item) => item.originKind === "routine_execution")) {
    const key = issue.title || issue.id;
    if (!routineGroups.has(key)) routineGroups.set(key, []);
    routineGroups.get(key).push(issue);
  }

  const staleOpenRoutineIssues = [];
  for (const group of routineGroups.values()) {
    const sorted = [...group].sort(compareRoutineCurrency);
    const keep = sorted[0];
    for (const issue of sorted.slice(1)) {
      if (issue.status !== "blocked" && issue.id !== keep.id) {
        staleOpenRoutineIssues.push(summarizeIssue(issue));
      }
    }
  }

  return {
    generatedReviewIssues,
    manualSelfTests,
    routineReopen: routineReopen.sort((a, b) => a.title.localeCompare(b.title)),
    routineClose: routineClose.sort(compareIssueFreshness),
    staleOpenRoutineIssues: staleOpenRoutineIssues.sort(compareIssueFreshness),
  };
}

function classifyRuns(runs) {
  const now = Date.now();
  const queuedCutoffMs = 30 * 60 * 1000;
  const runningCutoffMs = 60 * 60 * 1000;
  return runs
    .filter((run) => {
      if (run.status === "queued") {
        const createdAt = Date.parse(run.createdAt || 0);
        return Number.isFinite(createdAt) && now - createdAt > queuedCutoffMs;
      }
      if (run.status === "running") {
        const activityAt = Date.parse(
          run.lastOutputAt || run.processStartedAt || run.startedAt || run.createdAt || 0,
        );
        return Number.isFinite(activityAt) && now - activityAt > runningCutoffMs;
      }
      return false;
    })
    .map(summarizeRun);
}

function classifyQueuedClosedIssueRuns(runs, issues) {
  const issuesById = new Map(issues.map((issue) => [issue.id, issue]));
  return runs
    .filter((run) => {
      if (run.status !== "queued") return false;
      const issueId = run.contextSnapshot && (run.contextSnapshot.issueId || run.contextSnapshot.taskId);
      if (!issueId) return false;
      const issue = issuesById.get(issueId);
      return issue && (issue.status === "done" || issue.status === "cancelled");
    })
    .map(summarizeRun);
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function compactPlan(plan) {
  return {
    mode: plan.mode,
    before: plan.before,
    actionCounts: {
      agentPatches: plan.actions.agentPatches.length,
      staleRuns: plan.actions.staleRuns.length,
      generatedReviewIssuesToClose: plan.actions.generatedReviewIssuesToClose.length,
      manualSelfTestsToClose: plan.actions.manualSelfTestsToClose.length,
      routineIssuesToReopen: plan.actions.routineIssuesToReopen.length,
      staleRoutineIssuesToClose: plan.actions.staleRoutineIssuesToClose.length,
      staleOpenRoutineIssuesToClose: plan.actions.staleOpenRoutineIssuesToClose.length,
      queuedClosedIssueRunsToCancel: plan.actions.queuedClosedIssueRunsToCancel.length,
      wakeAgentIds: plan.actions.wakeAgentIds.length,
    },
    agentsPatched: plan.actions.agentPatches.map((agent) => agent.name),
    routineIssuesReopened: plan.actions.routineIssuesToReopen.map(
      (issue) => `${issue.identifier} ${issue.title}`,
    ),
    manualSelfTestsClosed: plan.actions.manualSelfTestsToClose.map(
      (issue) => `${issue.identifier} ${issue.title}`,
    ),
  };
}

function safeMutate(label, fn, results) {
  try {
    const body = fn();
    results.push({ label, ok: true, body });
  } catch (error) {
    results.push({
      label,
      ok: false,
      error: error.message,
      body: error.body || null,
    });
  }
}

function main() {
  const agents = requestJson(`/api/companies/${COMPANY_ID}/agents`);
  const issues = requestJson(`/api/companies/${COMPANY_ID}/issues?limit=1000`);
  const runs = requestJson(`/api/companies/${COMPANY_ID}/heartbeat-runs?limit=300`);

  const agentPatches = agents
    .filter(
      (agent) =>
        agent.adapterType !== "opencode_local" ||
        (agent.adapterConfig && agent.adapterConfig.command !== "opencode") ||
        (agent.adapterConfig && agent.adapterConfig.model !== desiredModelForAgent(agent)) ||
        (agent.adapterConfig &&
          typeof agent.adapterConfig.model === "string" &&
          agent.adapterConfig.model.includes("nemotron")),
    )
    .map(summarizeAgent);
  const staleRuns = classifyRuns(runs);
  const issuePlan = classifyIssues(issues);
  const wakeAgentIds = new Set([
    ...agents.filter((agent) => agent.status === "error").map((agent) => agent.id),
    ...agentPatches.map((agent) => agent.id),
    ...issuePlan.routineReopen.map((issue) => issue.assigneeAgentId).filter(Boolean),
  ]);
  const queuedClosedIssueRuns = classifyQueuedClosedIssueRuns(runs, issues);

  const plan = {
    mode: APPLY ? "apply" : "dry-run",
    before: {
      agents: {
        total: agents.length,
        byStatus: countBy(agents, (agent) => agent.status),
        byModelStatus: countBy(
          agents,
          (agent) => `${agent.status}|${agent.adapterType}|${agent.adapterConfig && agent.adapterConfig.model}`,
        ),
      },
      issues: {
        total: issues.length,
        open: issues.filter(isOpen).length,
        openByStatus: countBy(issues.filter(isOpen), (issue) => issue.status),
        blockedByOrigin: countBy(
          issues.filter((issue) => issue.status === "blocked"),
          (issue) => issue.originKind,
        ),
      },
      runs: {
        sampled: runs.length,
        byStatus: countBy(runs, (run) => run.status),
        byErrorCode: countBy(
          runs.filter((run) => run.errorCode),
          (run) => run.errorCode,
        ),
      },
    },
    actions: {
      agentPatches,
      staleRuns,
      generatedReviewIssuesToClose: issuePlan.generatedReviewIssues,
      manualSelfTestsToClose: issuePlan.manualSelfTests,
      routineIssuesToReopen: issuePlan.routineReopen,
      staleRoutineIssuesToClose: issuePlan.routineClose,
      staleOpenRoutineIssuesToClose: issuePlan.staleOpenRoutineIssues,
      queuedClosedIssueRunsToCancel: queuedClosedIssueRuns,
      wakeAgentIds: Array.from(wakeAgentIds),
    },
  };

  if (!APPLY) {
    console.log(JSON.stringify(COMPACT ? compactPlan(plan) : plan, null, 2));
    return;
  }

  const operations = [];
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));

  for (const agent of agentPatches) {
    operations.push(
      buildOperation(`patch-agent:${agent.name}`, "PATCH", `/api/agents/${agent.id}`, buildAgentPatch(agentsById.get(agent.id))),
    );
  }

  for (const run of staleRuns) {
    operations.push(buildOperation(`cancel-run:${run.id}`, "POST", `/api/heartbeat-runs/${run.id}/cancel`, {}));
  }
  for (const run of queuedClosedIssueRuns) {
    operations.push(
      buildOperation(`cancel-closed-issue-run:${run.id}`, "POST", `/api/heartbeat-runs/${run.id}/cancel`, {}),
    );
  }

  const issueClosePlan = uniqueById([
    ...issuePlan.generatedReviewIssues,
    ...issuePlan.manualSelfTests,
    ...issuePlan.routineClose,
    ...issuePlan.staleOpenRoutineIssues,
  ]);
  for (const issue of issueClosePlan) {
    operations.push(buildOperation(`close-issue:${issue.identifier}`, "PATCH", `/api/issues/${issue.id}`, { status: "done" }));
  }

  for (const issue of issuePlan.routineReopen) {
    operations.push(buildOperation(`reopen-routine:${issue.identifier}`, "PATCH", `/api/issues/${issue.id}`, { status: "todo" }));
  }

  for (const agentId of wakeAgentIds) {
    const agent = agentsById.get(agentId);
    operations.push(
      buildOperation(`wake-agent:${agent ? agent.name : agentId}`, "POST", `/api/agents/${agentId}/heartbeat/invoke`, {}),
    );
  }

  const mutations = batchMutate(operations);

  const refreshedAgents = requestJson(`/api/companies/${COMPANY_ID}/agents`);
  const refreshedIssues = requestJson(`/api/companies/${COMPANY_ID}/issues?limit=1000`);
  const refreshedRuns = requestJson(`/api/companies/${COMPANY_ID}/heartbeat-runs?limit=300`);

  console.log(
    JSON.stringify(
      COMPACT
        ? {
            ...compactPlan(plan),
            mutationSummary: {
              total: mutations.length,
              succeeded: mutations.filter((mutation) => mutation.ok).length,
              failed: mutations.filter((mutation) => !mutation.ok),
            },
            after: {
              agents: {
                total: refreshedAgents.length,
                byStatus: countBy(refreshedAgents, (agent) => agent.status),
                byModelStatus: countBy(
                  refreshedAgents,
                  (agent) =>
                    `${agent.status}|${agent.adapterType}|${agent.adapterConfig && agent.adapterConfig.model}`,
                ),
                remainingNemotron: refreshedAgents
                  .filter(
                    (agent) =>
                      agent.adapterConfig &&
                      typeof agent.adapterConfig.model === "string" &&
                      agent.adapterConfig.model.includes("nemotron"),
                  )
                  .map(summarizeAgent),
              },
              issues: {
                total: refreshedIssues.length,
                open: refreshedIssues.filter(isOpen).length,
                openByStatus: countBy(refreshedIssues.filter(isOpen), (issue) => issue.status),
                blockedByOrigin: countBy(
                  refreshedIssues.filter((issue) => issue.status === "blocked"),
                  (issue) => issue.originKind,
                ),
              },
              runs: {
                sampled: refreshedRuns.length,
                byStatus: countBy(refreshedRuns, (run) => run.status),
                byErrorCode: countBy(
                  refreshedRuns.filter((run) => run.errorCode),
                  (run) => run.errorCode,
                ),
              },
            },
          }
        : {
            ...plan,
        mutationSummary: {
          total: mutations.length,
          succeeded: mutations.filter((mutation) => mutation.ok).length,
          failed: mutations.filter((mutation) => !mutation.ok),
        },
        after: {
          agents: {
            total: refreshedAgents.length,
            byStatus: countBy(refreshedAgents, (agent) => agent.status),
            byModelStatus: countBy(
              refreshedAgents,
              (agent) =>
                `${agent.status}|${agent.adapterType}|${agent.adapterConfig && agent.adapterConfig.model}`,
            ),
            remainingNemotron: refreshedAgents
              .filter(
                (agent) =>
                  agent.adapterConfig &&
                  typeof agent.adapterConfig.model === "string" &&
                  agent.adapterConfig.model.includes("nemotron"),
              )
              .map(summarizeAgent),
          },
          issues: {
            total: refreshedIssues.length,
            open: refreshedIssues.filter(isOpen).length,
            openByStatus: countBy(refreshedIssues.filter(isOpen), (issue) => issue.status),
            blockedByOrigin: countBy(
              refreshedIssues.filter((issue) => issue.status === "blocked"),
              (issue) => issue.originKind,
            ),
          },
          runs: {
            sampled: refreshedRuns.length,
            byStatus: countBy(refreshedRuns, (run) => run.status),
            byErrorCode: countBy(
              refreshedRuns.filter((run) => run.errorCode),
              (run) => run.errorCode,
            ),
          },
        },
          },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error.message,
        body: error.body || null,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
