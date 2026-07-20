#!/usr/bin/env node
// Batch Contact Enrichment: enrich multiple accounts from seed data
const fs = require('fs');
const path = require('path');

function loadSeed() {
  const seedPath = path.resolve(__dirname, '..', 'ops', 'crm', 'enrichment_seed.json');
  if (!fs.existsSync(seedPath)) {
    console.error('Seed data not found at', seedPath);
    process.exit(3);
  }
  const raw = fs.readFileSync(seedPath, 'utf8');
  return JSON.parse(raw).accounts;
}

function enrich(accountId, accounts) {
  const acct = accounts.find(a => a.account_id === accountId);
  if (!acct) return null;
  const enriched = JSON.parse(JSON.stringify(acct));
  enriched.enrichment_status = 'completed';
  enriched.last_enriched = new Date().toISOString();
  enriched.crm = enriched.crm || {};
  enriched.crm.source = 'manual_enrichment';
  enriched.crm.owner = 'Operations Lead';
  enriched.crm.contacts = enriched.contacts || acct.contacts || [];
  enriched.crm.requiredTags = [
    'source','ICP','sector','geography','urgency','trigger_event','introducer'
  ];
  return enriched;
}

function main() {
  const args = process.argv.slice(2);
  const inputRoot = args.find(a => a.startsWith('--input'));
  let inputPath = null;
  if (inputRoot) {
    if (inputRoot.includes('=')) {
      inputPath = inputRoot.split('=')[1];
    } else {
      const idx = args.indexOf(inputRoot);
      inputPath = args[idx + 1];
    }
  } else {
    console.error('Usage: node scripts/batch_contact_enrichment.js --input <input.json>');
    process.exit(2);
  }
  inputPath = path.resolve(inputPath);
  if (!fs.existsSync(inputPath)) {
    console.error('Input file not found:', inputPath);
    process.exit(4);
  }

  const batch = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const accounts = loadSeed();
  const results = batch.accounts.map(id => enrich(id, accounts)).filter(Boolean);
  console.log(JSON.stringify({ accounts: results }, null, 2));
}

main();
