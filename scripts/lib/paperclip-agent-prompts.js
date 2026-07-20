const fs = require("fs");
const path = require("path");

function getInstructionsConfig(promptsDir, agentId) {
  const instructionsEntryFile = `${agentId}.md`;
  const instructionsFilePath = path.join(promptsDir, instructionsEntryFile);

  if (!fs.existsSync(instructionsFilePath)) {
    return {};
  }

  return {
    instructionsFilePath,
    instructionsRootPath: promptsDir,
    instructionsEntryFile,
    instructionsBundleMode: "external",
  };
}

module.exports = {
  getInstructionsConfig,
};
