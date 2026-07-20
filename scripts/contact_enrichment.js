#!/usr/bin/env node
// Contact Enrichment CLI (minimal, local-lookup implementation)
// Purpose: enrich a given account with additional contact/account details using local seed data.

const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node scripts/contact_enrichment.js --input <input.json>');
  console.log('Where input.json has structure:');
  console.log('{"account_id": "ACME-001"}');
  process.exit(2);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--input' && i + 1 < args.length) {
      out.input = args[i + 1];
      i++;
    } else if (a.startsWith('--input=')) {
      out.input = a.split('=')[1];
    }
  }
  return out;
}

function loadSeed() {
  const seedPath = path.resolve(__dirname, '..', 'ops', 'crm', 'enrichment_seed.json');
  if (!fs.existsSync(seedPath)) {
    console.error('Seed data not found at', seedPath);
    process.exit(3);
  }
  const raw = fs.readFileSync(seedPath, 'utf-8');
  return JSON.parse(raw);
}

function enrichAccount(accountId, seed) {
  // Try to locate by account_id; if not found, return null
  const acct = seed.accounts.find(a => a.account_id === accountId);
  if (!acct) return null;

  // Simple enrichment: append enrichment metadata and enriched contacts if not present
  const enriched = JSON.parse(JSON.stringify(acct));
  enriched.enrichment_status = 'completed';
  enriched.last_enriched = new Date().toISOString();
  enriched.tags = enriched.tags || [];
  // ensure a minimal CRM-ready structure
  enriched.crm = enriched.crm || {};
  enriched.crm.source = 'manual_enrichment';
  enriched.crm.owner = 'Operations Lead';
  enriched.crm.contacts = enriched.contacts || acct.contacts || [];
  // example: ensure mandatory CRM fields exist per pipeline schema
  enriched.crm.requiredTags = [ 'source','ICP','sector','geography','urgency','trigger_event','introducer' ];
  return enriched;
}

function main() {
  const args = parseArgs();
  if (!args.input) {
    usage();
  }
  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error('Input file not found:', inputPath);
    process.exit(4);
  }
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const seed = loadSeed();

  if (!input.account_id) {
    console.error('Input must include account_id');
    process.exit(5);
  }

  const enriched = enrichAccount(input.account_id, seed);
  if (!enriched) {
    console.error('Account not found in seed data:', input.account_id);
    process.exit(6);
  }

  // Write enriched output to stdout as JSON for consumption by other steps
  console.log(JSON.stringify({ account_id: input.account_id, enriched }, null, 2));
}

main();
