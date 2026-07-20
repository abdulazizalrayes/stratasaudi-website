#!/usr/bin/env node

// Minimal data cleanup / enrichment utility
// Reads CSV input, trims fields, normalizes emails to lowercase,
// deduplicates by 'id' column, and fills missing 'country' with 'Unknown'.

const fs = require("fs");
const path = require("path");

const INPUT_FILE = process.env.DATA_CLEAN_INPUT || path.join(__dirname, "..", "data", "input.csv");
const OUTPUT_FILE = process.env.DATA_CLEAN_OUTPUT || path.join(__dirname, "..", "data", "cleaned_output.csv");

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const parts = line.split(",");
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = parts[idx] !== undefined ? parts[idx].trim() : "";
    });
    return row;
  });
  return { headers, rows };
}

function stringifyCSV(headers, rows) {
  const headerLine = headers.join(",");
  const lines = [headerLine];
  for (const r of rows) {
    const line = headers.map((h) => {
      const v = r[h] !== undefined ? r[h] : "";
      // Escape double quotes
      const escaped = String(v).replace(/"/g, '""');
      // Simple CSV rule: wrap fields containing comma or quote in quotes
      if (escaped.includes("," ) || escaped.includes("\n")) {
        return `"${escaped}"`;
      }
      return escaped;
    }).join(",");
    lines.push(line);
  }
  return lines.join("\n");
}

function cleanRows(rows, headers) {
  const seen = new Set();
  const cleaned = [];
  for (const r of rows) {
    const clean = {};
    headers.forEach((h) => {
      let v = r[h] ?? "";
      if (typeof v === "string") v = v.trim();
      if (h.toLowerCase() === "email" && typeof v === "string") {
        v = v.toLowerCase();
      }
      clean[h] = v;
    });
    const id = clean["id"] || clean["ID"] || "";
    const key = String(id);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    cleaned.push(clean);
  }
  // enrich: ensure country exists
  for (const row of cleaned) {
    if (!row.country || row.country.trim() === "") row.country = "Unknown";
  }
  return cleaned;
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }
  const text = fs.readFileSync(INPUT_FILE, "utf8");
  const { headers, rows } = parseCSV(text);
  if (!headers.length) {
    console.error("Invalid CSV: no headers");
    process.exit(1);
  }
  const cleaned = cleanRows(rows, headers);
  // Build CSV output content. Append mode with dedupe to accumulate history without duplicates.
  const headerLine = headers.join(",");
  const dataLines = cleaned.map((r) => {
    return headers.map((h) => {
      let v = r[h] ?? "";
      if (typeof v === "string") v = v.trim();
      const escaped = String(v).replace(/"/g, '""');
      if (escaped.includes(",") || escaped.includes("\n")) {
        return `"${escaped}"`;
      }
      return escaped;
    }).join(",");
  });
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  if (!fs.existsSync(OUTPUT_FILE)) {
    // New file: write header + all data lines
    const content = [headerLine, ...dataLines].join("\n");
    fs.writeFileSync(OUTPUT_FILE, content + "\n");
  } else {
    // Append mode: dedupe by id to avoid duplicates across batches
    const existing = fs.readFileSync(OUTPUT_FILE, "utf8").split(/\r?\n/).filter(l => l.trim() !== "");
    const existingIds = new Set();
    for (let i = 1; i < existing.length; i++) {
      const idToken = existing[i].split(",")[0];
      const id = idToken ? idToken.replace(/^"|"$/g, "") : "";
      if (id) existingIds.add(id);
    }
    const toAppend = dataLines.filter((line) => {
      const idToken = line.split(",")[0];
      const id = idToken ? idToken.replace(/^"|"$/g, "") : "";
      return id && !existingIds.has(id);
    });
    if (toAppend.length > 0) {
      fs.appendFileSync(OUTPUT_FILE, toAppend.join("\n") + "\n");
    }
  }
  console.log(JSON.stringify({ input: INPUT_FILE, output: OUTPUT_FILE, rowsIn: rows.length, rowsOut: cleaned.length, headers }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
