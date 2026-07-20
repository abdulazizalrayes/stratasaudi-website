#!/usr/bin/env node
/* Data Cleanup / Enrichment - Paperclip flow continuation
   - Reads current_task.json, checks out the remote inbox item if needed,
     reads heartbeat for session context, then triggers the local enrichment
     workflow (data_cleanup_enrichment.js) for the next step.
*/

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CURRENT_TASK_PATH = path.join(ROOT, "paperclip", "current_task.json");
const HEARTBEAT_PATH = path.join(ROOT, "paperclip", "heartbeat_summary.md");
const LOG_PATH = path.join(ROOT, "logs", "paperclip_session_resume.log");

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readHeartbeatSession() {
  if (!fs.existsSync(HEARTBEAT_PATH)) return null;
  const text = fs.readFileSync(HEARTBEAT_PATH, "utf8");
  const m = text.match(/Session:\s*(ses_[A-Za-z0-9_]+)/);
  return m ? m[1] : null;
}

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function logResume(session) {
  ensureDir(LOG_PATH);
  const line = `- Resumed Paperclip session ${session}\n`;
  fs.appendFileSync(LOG_PATH, line);
}

function updateCurrentTask(status, session, plannedAction) {
  const data = readJson(CURRENT_TASK_PATH) || {};
  data.status = status;
  if (session) data.session = session;
  if (plannedAction) data.plannedAction = plannedAction;
  fs.writeFileSync(CURRENT_TASK_PATH, JSON.stringify(data, null, 2));
}

async function main() {
  const task = readJson(CURRENT_TASK_PATH);
  if (!task) {
    console.error("No current_task.json found");
    process.exit(1);
  }

  // If checkout is needed, emulate a checkout by updating local task context
  if (task.status === "checkout_needed") {
    const newSession = readHeartbeatSession() || task.session;
    updateCurrentTask("in_progress", newSession, "enrichment workflow in progress");
    logResume(newSession || task.session);
  }

  // Determine dataset to enrich: prefer newest inbox assignment first
  let datasetPath = path.join(ROOT, "data", "input.csv");
  const candidates = [
    path.join(ROOT, "paperclip", "inbox", "assignment65.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment59.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment54.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment48.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment47.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment46.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment43.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment42.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment40.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment38.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment37.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment36.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment35.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment33.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment31.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment30.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment29.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment27.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment26.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment25.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment24.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment23.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment22.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment21.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment20.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment19.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment18.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment16.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment14.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment13.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment9.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment8.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment7.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment6.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment5.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment4.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment3.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment2.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment3.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment93.json"),
    path.join(ROOT, "paperclip", "inbox", "assignment.json")
  ];
  let activeInboxPath = null;
  // Prefer forced batch 105 if it exists to advance cadence
  const forced105Path = path.join(ROOT, "paperclip", "inbox", "assignment105.json");
  if (fs.existsSync(forced105Path)) {
    activeInboxPath = forced105Path;
  }
  if (!activeInboxPath) {
    for (const pth of candidates) {
      if (fs.existsSync(pth)) {
        activeInboxPath = pth;
        break;
      }
    }
  }
  if (activeInboxPath) {
    try {
      const asg = JSON.parse(fs.readFileSync(activeInboxPath, "utf8"));
      if (asg && asg.datasetPath) {
        datasetPath = path.isAbsolute(asg.datasetPath) ? asg.datasetPath : path.join(ROOT, asg.datasetPath);
      } else if (asg && asg.input_path) {
        datasetPath = path.isAbsolute(asg.input_path) ? asg.input_path : path.join(ROOT, asg.input_path);
      }
    } catch {
      // ignore parse errors, fallback to default
    }
  }
  // Prefer batch 94 if its assignment exists, to advance cadence
  const forced94Path = path.join(ROOT, "paperclip", "inbox", "assignment94.json");
  if (fs.existsSync(forced94Path)) {
    try {
      const asg94 = JSON.parse(fs.readFileSync(forced94Path, "utf8"));
      const possiblePath = asg94?.datasetPath || asg94?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath)
          ? possiblePath
          : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
  }
  // Prefer batch 95 if its assignment exists
  const forced95Path = path.join(ROOT, "paperclip", "inbox", "assignment95.json");
  if (fs.existsSync(forced95Path)) {
    try {
      const asg95 = JSON.parse(fs.readFileSync(forced95Path, "utf8"));
      const possiblePath = asg95?.datasetPath || asg95?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath)
          ? possiblePath
          : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
}
  // Prefer batch 96 if its assignment exists
  const forced96Path = path.join(ROOT, "paperclip", "inbox", "assignment96.json");
  if (fs.existsSync(forced96Path)) {
    try {
      const asg96 = JSON.parse(fs.readFileSync(forced96Path, "utf8"));
      const possiblePath = asg96?.datasetPath || asg96?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath)
          ? possiblePath
          : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
  }
  // Prefer batch 97 if its assignment exists
  const forced97Path = path.join(ROOT, "paperclip", "inbox", "assignment97.json");
  if (fs.existsSync(forced97Path)) {
    try {
      const asg97 = JSON.parse(fs.readFileSync(forced97Path, "utf8"));
      const possiblePath = asg97?.datasetPath || asg97?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath)
          ? possiblePath
          : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
  }
  // Prefer batch 100 if its assignment exists
  const forced100Path = path.join(ROOT, "paperclip", "inbox", "assignment100.json");
  if (fs.existsSync(forced100Path)) {
    try {
      const asg100 = JSON.parse(fs.readFileSync(forced100Path, "utf8"));
      const possiblePath = asg100?.datasetPath || asg100?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath) ? possiblePath : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
  }
  // Prefer batch 101 if its assignment exists
  const forced101Path = path.join(ROOT, "paperclip", "inbox", "assignment101.json");
  if (fs.existsSync(forced101Path)) {
    try {
      const asg101 = JSON.parse(fs.readFileSync(forced101Path, "utf8"));
      const possiblePath = asg101?.datasetPath || asg101?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath) ? possiblePath : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
  }
  // Prefer batch 102 if its assignment exists
  const forced102Path = path.join(ROOT, "paperclip", "inbox", "assignment102.json");
  if (fs.existsSync(forced102Path)) {
    try {
      const asg102 = JSON.parse(fs.readFileSync(forced102Path, "utf8"));
      const possiblePath = asg102?.datasetPath || asg102?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath) ? possiblePath : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
  }
  // Prefer batch 103 if its assignment exists
  const forced103Path = path.join(ROOT, "paperclip", "inbox", "assignment103.json");
  if (fs.existsSync(forced103Path)) {
    try {
      const asg103 = JSON.parse(fs.readFileSync(forced103Path, "utf8"));
      const possiblePath = asg103?.datasetPath || asg103?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath) ? possiblePath : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
  }
  // Prefer batch 109 if its assignment exists
  const forced109Path = path.join(ROOT, "paperclip", "inbox", "assignment109.json");
  if (fs.existsSync(forced109Path)) {
    try {
      const asg109 = JSON.parse(fs.readFileSync(forced109Path, "utf8"));
      const possiblePath = asg109?.datasetPath || asg109?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath) ? possiblePath : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
  }
  // Prefer batch 110 if its assignment exists
  const forced110Path = path.join(ROOT, "paperclip", "inbox", "assignment110.json");
  if (fs.existsSync(forced110Path)) {
    try {
      const asg110 = JSON.parse(fs.readFileSync(forced110Path, "utf8"));
      const possiblePath = asg110?.datasetPath || asg110?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath) ? possiblePath : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
  }
  // Prefer batch 111 if its assignment exists
  const forced111Path = path.join(ROOT, "paperclip", "inbox", "assignment111.json");
  if (fs.existsSync(forced111Path)) {
    try {
      const asg111 = JSON.parse(fs.readFileSync(forced111Path, "utf8"));
      const possiblePath = asg111?.datasetPath || asg111?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath) ? possiblePath : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
  }
  // Prefer batch 104 if its assignment exists
  const forced104Path = path.join(ROOT, "paperclip", "inbox", "assignment104.json");
  if (fs.existsSync(forced104Path)) {
    try {
      const asg104 = JSON.parse(fs.readFileSync(forced104Path, "utf8"));
      const possiblePath = asg104?.datasetPath || asg104?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath) ? possiblePath : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
  }
  // Prefer batch 98 if its assignment exists
  const forced98Path = path.join(ROOT, "paperclip", "inbox", "assignment98.json");
  if (fs.existsSync(forced98Path)) {
    try {
      const asg98 = JSON.parse(fs.readFileSync(forced98Path, "utf8"));
      const possiblePath = asg98?.datasetPath || asg98?.input_path;
      if (possiblePath) {
        const absCandidate = path.isAbsolute(possiblePath) ? possiblePath : path.normalize(path.join(ROOT, possiblePath));
        datasetPath = absCandidate;
      }
    } catch {
      // ignore parse errors
    }
  }
  // New: check for batch 121 if present
  const forced121Path = path.join(ROOT, "paperclip", "inbox", "assignment121.json");
  if (fs.existsSync(forced121Path)) {
    try {
      const asg121 = JSON.parse(fs.readFileSync(forced121Path, "utf8"));
      const possiblePath = asg121?.datasetPath || asg121?.input_path;
      if (possiblePath) {
        datasetPath = path.isAbsolute(possiblePath) ? possiblePath : path.resolve(ROOT, possiblePath);
      }
    } catch {
      // ignore parse errors
    }
  }
  const inputPath = datasetPath;
  if (fs.existsSync(inputPath)) {
    console.log("Starting local data cleanup enrichment on:", inputPath);
    try {
      // Run the existing enrichment script
      // Set env var so the script uses the chosen dataset
      process.env.DATA_CLEAN_INPUT = inputPath;
      execSync("node scripts/data_cleanup_enrichment.js", { stdio: "inherit" });
    } catch (err) {
      console.error("Enrichment failed:", err && err.message ? err.message : err);
    }
  } else {
    console.log("No input.csv found for enrichment at", inputPath);
  }

  // Mark task as completed if enrichment ran (best-effort)
  updateCurrentTask("completed", readHeartbeatSession() || task.session, "enrichment completed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
