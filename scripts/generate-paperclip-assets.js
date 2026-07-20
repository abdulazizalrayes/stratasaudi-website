const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const skillsRegistryPath = path.join(root, "paperclip", "skills", "registry.json");
const agentsRegistryPath = path.join(root, "paperclip", "agents", "registry.json");
const promptOverridesPath = path.join(root, "paperclip", "agents", "prompt-overrides.json");
const projectInstructionPath = path.join(root, "STRATA_PROJECT_OPERATING_INSTRUCTION.md");

const skillsRegistry = JSON.parse(fs.readFileSync(skillsRegistryPath, "utf8"));
const agentsRegistry = JSON.parse(fs.readFileSync(agentsRegistryPath, "utf8"));
const promptOverrides = fs.existsSync(promptOverridesPath)
  ? JSON.parse(fs.readFileSync(promptOverridesPath, "utf8"))
  : {};
const projectInstruction = fs.readFileSync(projectInstructionPath, "utf8").trim();
const forceRegenerateCompanySkills = process.env.STRATA_FORCE_REGENERATE_COMPANY_SKILLS === "true";
const forceRegenerateAgentPrompts = process.env.STRATA_FORCE_REGENERATE_AGENT_PROMPTS === "true";

const skillBaseDir = path.join(root, "paperclip", "company-skills");
const agentPromptDir = path.join(root, "paperclip", "agents", "prompts");

fs.mkdirSync(skillBaseDir, { recursive: true });
fs.mkdirSync(agentPromptDir, { recursive: true });

let generatedSkillCount = 0;
let preservedSkillCount = 0;

for (const skill of skillsRegistry.skills) {
  const target = path.join(skillBaseDir, skill.id);
  const body = `---
name: ${skill.id}
description: >
  Use when Strata Saudi needs ${skill.purpose.charAt(0).toLowerCase() + skill.purpose.slice(1)}
---

# ${skill.name}

## Purpose

${skill.purpose}

## Required behavior

- Follow the Strata Saudi operating instruction first.
- Keep outputs premium, discreet, and technically serious.
- Prefer grounded evidence over generic wording.
- Escalate when the task becomes final, high-risk, or commercially sensitive.

## Output shape

${skill.outputs.map((output) => `- ${output}`).join("\n")}
`;

  if (fs.existsSync(target) && !forceRegenerateCompanySkills) {
    preservedSkillCount += 1;
    continue;
  }

  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    fs.writeFileSync(target, body);
  } else {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), body);
  }
  generatedSkillCount += 1;
}

let generatedAgentPromptCount = 0;
let preservedAgentPromptCount = 0;

for (const agent of agentsRegistry.agents) {
  const override = promptOverrides[agent.id];
  const body = `# ${agent.name}

${projectInstruction}

## Agent-specific instruction

Business owner: ${agent.businessOwner}
Objective: ${agent.objective}
Job-to-be-done: ${agent.jobToBeDone}
Lane: ${agent.lane}
Adapter: ${agent.adapter}
Provider/model: ${agent.providerModel}
Fallback: ${agent.fallback}
Escalation path: ${agent.escalationPath}
Browser permission: ${agent.browserPermission ? "Allowed only under governance policy." : "Not allowed."}
Approval requirement: ${agent.approvalRequirement}

## Responsibilities

${agent.responsibilities.map((item) => `- ${item}`).join("\n")}

## Required skills

${agent.requiredSkills.map((item) => `- ${item}`).join("\n")}

## KPI ownership

${agent.kpiOwnership.map((item) => `- ${item}`).join("\n")}

## Execution rules

- Operate only within Strata Saudi context.
- Do not mix legacy brands or unrelated companies into your work.
- Default to practical implementation, not abstract recommendations.
- Escalate high-risk or final-decision work according to the governance path above.
${override && Array.isArray(override.additionalInstruction) ? `\n\n${override.additionalInstruction.join("\n")}` : ""}
`;
  const targetPath = path.join(agentPromptDir, `${agent.id}.md`);

  if (fs.existsSync(targetPath) && !forceRegenerateAgentPrompts) {
    preservedAgentPromptCount += 1;
    continue;
  }

  fs.writeFileSync(targetPath, body);
  generatedAgentPromptCount += 1;
}

console.log(
  `Wrote ${generatedSkillCount} skills, preserved ${preservedSkillCount} existing skills, wrote ${generatedAgentPromptCount} agent prompts, preserved ${preservedAgentPromptCount} existing prompts.`,
);
