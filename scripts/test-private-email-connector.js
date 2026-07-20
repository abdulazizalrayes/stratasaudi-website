#!/usr/bin/env node

const { loadLocalEnv } = require("../lib/load-local-env");
const { checkMailboxHealth } = require("../lib/private-email-client");

loadLocalEnv();

async function main() {
  const result = await checkMailboxHealth();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
