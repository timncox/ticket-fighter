#!/usr/bin/env node
// Fill NYC DOF "Dispute by Web" form for a given violation.
// HEADED — stops at final Review/Submit for you to click submit yourself.
//
// Entry: https://www.nyc.gov/site/finance/vehicles/dispute-web.page
//   → click the "Dispute by Web" button → NYCServ HBW flow
//
// Persistent polling approach: every 3 seconds the script re-scans the current
// page, fills any form field it recognizes, and attaches evidence to any file
// input it finds. That way it doesn't matter which step of the multi-page flow
// you're on — you navigate, it auto-fills whatever appears.
//
// Usage: node submit-dispute-nyc.mjs <violation_number>

import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TF_DIR = path.join(os.homedir(), ".ticket-fighter");
const DECISIONS_DIR = path.join(TF_DIR, "decisions");
const RESPONDENT_FILE = path.join(TF_DIR, "respondent.json");
const EVIDENCE_FILE = path.join(TF_DIR, "evidence.json");
const ENTRY_URL = "https://www.nyc.gov/site/finance/vehicles/dispute-web.page";

function loadRespondent() {
  if (!fs.existsSync(RESPONDENT_FILE)) {
    console.error(`Missing ${RESPONDENT_FILE}`);
    console.error(
      "Create it with your personal info:\n" +
      '  {\n    "firstName": "Jane",\n    "lastName": "Doe",\n    "name": "Jane Doe",\n' +
      '    "address": "123 Main St",\n    "city": "Brooklyn",\n    "state": "NY",\n' +
      '    "zip": "11201",\n    "email": "jane@example.com",\n    "phone": "",\n' +
      '    "plate": { "number": "ABC1234", "state": "NY", "type": "PAS" }\n  }'
    );
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(RESPONDENT_FILE, "utf-8"));
}

// evidence.json maps violation # → array of file paths. Absolute or relative to DECISIONS_DIR.
function loadEvidence() {
  if (!fs.existsSync(EVIDENCE_FILE)) return {};
  const raw = JSON.parse(fs.readFileSync(EVIDENCE_FILE, "utf-8"));
  const out = {};
  for (const [k, paths] of Object.entries(raw)) {
    out[k] = (paths || []).map((p) => path.isAbsolute(p) ? p : path.join(DECISIONS_DIR, p));
  }
  return out;
}

const RESPONDENT = loadRespondent();
const PLATE = RESPONDENT.plate ?? { number: "", state: "NY", type: "PAS" };
const EVIDENCE = loadEvidence();

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadArgument(violation) {
  const p = path.join(DECISIONS_DIR, `dispute-${violation}.txt`);
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  return fs.readFileSync(p, "utf-8").trim();
}

// Memoize which locator we already filled so we don't overwrite user edits
const filledMarker = new WeakMap();

async function tryFill(page, selectors, value, label, alreadyFilled) {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      const n = await loc.count().catch(() => 0);
      if (!n) continue;
      const visible = await loc.isVisible().catch(() => false);
      if (!visible) continue;
      const key = `${sel}|${label}`;
      if (alreadyFilled.has(key)) return false;
      // Skip if the field already has content (user may be typing)
      const existing = await loc.inputValue().catch(() => "");
      if (existing && existing.length > 0 && existing !== value) return false;
      await loc.fill(value);
      alreadyFilled.add(key);
      console.log(`  [filled] ${label}`);
      return true;
    } catch {}
  }
  return false;
}

async function scanAndFill(page, violation, arg, evidence, alreadyFilled) {
  // Name variants
  await tryFill(page, [
    "input[name*='firstName' i]", "input[id*='firstName' i]",
    "input[name*='fname' i]",
  ], RESPONDENT.firstName, "first name", alreadyFilled);
  await tryFill(page, [
    "input[name*='lastName' i]", "input[id*='lastName' i]",
    "input[name*='lname' i]",
  ], RESPONDENT.lastName, "last name", alreadyFilled);
  await tryFill(page, [
    "input[name*='respondentName' i]", "input[id*='fullName' i]",
    "input[name='name']",
  ], RESPONDENT.name, "full name", alreadyFilled);

  await tryFill(page, [
    "input[name*='address' i]", "input[name*='street' i]",
    "input[id*='address1' i]", "input[id*='addr' i]",
  ], RESPONDENT.address, "address", alreadyFilled);
  await tryFill(page, [
    "input[name*='city' i]", "input[id*='city' i]",
  ], RESPONDENT.city, "city", alreadyFilled);
  await tryFill(page, [
    "input[name*='state' i]:not([name*='plate' i])",
  ], RESPONDENT.state, "state (input)", alreadyFilled);
  await tryFill(page, [
    "input[name*='zip' i]", "input[name*='postal' i]",
  ], RESPONDENT.zip, "zip", alreadyFilled);
  await tryFill(page, [
    "input[type='email']", "input[name*='email' i]", "input[id*='email' i]",
  ], RESPONDENT.email, "email", alreadyFilled);

  await tryFill(page, [
    "input[name*='plate' i]:not([name*='state' i])",
    "input[id*='plate' i]:not([id*='state' i])",
  ], PLATE.number, "plate #", alreadyFilled);
  await tryFill(page, [
    "input[name*='violation' i]", "input[id*='violation' i]",
    "input[name*='summons' i]", "input[id*='summons' i]",
  ], violation, "violation #", alreadyFilled);

  // Argument textarea — try narrow selectors first, then any textarea
  await tryFill(page, [
    "textarea[name*='defense' i]",
    "textarea[name*='statement' i]",
    "textarea[name*='reason' i]",
    "textarea[name*='argument' i]",
    "textarea[name*='narrative' i]",
    "textarea[id*='defense' i]",
    "textarea[id*='statement' i]",
    "textarea",
  ], arg, "argument", alreadyFilled);

  // <select> dropdowns for state
  try {
    const stateSelects = page.locator("select[name*='state' i]:not([name*='plate' i])");
    const n = await stateSelects.count();
    for (let i = 0; i < n; i++) {
      const sel = stateSelects.nth(i);
      const key = `select:state:${i}`;
      if (alreadyFilled.has(key)) continue;
      if (!(await sel.isVisible().catch(() => false))) continue;
      const cur = await sel.inputValue().catch(() => "");
      if (cur && cur !== "" && cur !== "0") continue;
      await sel.selectOption({ label: "NY" }).catch(() => sel.selectOption("NY"));
      alreadyFilled.add(key);
      console.log("  [filled] state select → NY");
    }
  } catch {}

  // Evidence attach — any file input
  if (evidence.length > 0) {
    try {
      const fileInputs = page.locator("input[type='file']");
      const n = await fileInputs.count();
      for (let i = 0; i < n; i++) {
        const fi = fileInputs.nth(i);
        const key = `file:${i}`;
        if (alreadyFilled.has(key)) continue;
        await fi.setInputFiles(evidence).catch(() => {});
        alreadyFilled.add(key);
        console.log(`  [attached] ${evidence.length} files → file input #${i}`);
      }
    } catch {}
  }
}

async function run(violation) {
  const arg = loadArgument(violation);
  const evidence = EVIDENCE[violation] ?? [];
  console.log(`\nViolation: ${violation}`);
  console.log(`Argument: ${arg.length} chars`);
  console.log(`Evidence files: ${evidence.length}`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent: UA, locale: "en-US" });
  const firstPage = await context.newPage();

  console.log(`\n→ opening ${ENTRY_URL}`);
  console.log("Click 'Dispute by Web' on the nyc.gov page — it may open a NEW TAB.");
  console.log("I'll follow all tabs/windows in this context and fill any form fields I recognize every 3s.\n");
  console.log("When you reach a final Review/Submit page: REVIEW, then click Submit yourself.\n");

  await firstPage.goto(ENTRY_URL, { waitUntil: "domcontentloaded" });

  // Track all pages in the context (tabs, popups)
  const pages = new Set([firstPage]);
  context.on("page", (p) => {
    pages.add(p);
    console.log(`\n→ new tab opened: ${p.url()}`);
    p.on("close", () => pages.delete(p));
  });

  const filledByUrl = new Map(); // url → Set of filled-keys

  async function scanOne(p) {
    let url;
    try { url = p.url(); } catch { return; }
    if (!url || url === "about:blank") return;
    let filled = filledByUrl.get(url);
    if (!filled) { filled = new Set(); filledByUrl.set(url, filled); }
    // Scan the main frame
    try {
      await scanAndFill(p, violation, arg, evidence, filled);
    } catch (e) {
      if (!String(e).includes("Execution context was destroyed")) {
        console.log(`  [scan error] ${e.message}`);
      }
    }
    // Scan each iframe as a frame locator
    try {
      for (const frame of p.frames()) {
        if (frame === p.mainFrame()) continue;
        const furl = frame.url();
        if (!furl || furl === "about:blank") continue;
        let ff = filledByUrl.get(`frame:${furl}`);
        if (!ff) { ff = new Set(); filledByUrl.set(`frame:${furl}`, ff); }
        // Use a proxy object that exposes .locator() rooted in the frame
        const frameProxy = {
          locator: (sel) => frame.locator(sel),
          url: () => frame.url(),
        };
        await scanAndFill(frameProxy, violation, arg, evidence, ff);
      }
    } catch {}
  }

  const started = Date.now();
  const MAX_MINUTES = 120;
  while (Date.now() - started < MAX_MINUTES * 60_000) {
    for (const p of Array.from(pages)) {
      if (p.isClosed()) { pages.delete(p); continue; }
      await scanOne(p);
    }
    await sleep(3000);
  }

  console.log("\nTimeout. Closing browser.");
  await browser.close();
}

const v = process.argv[2];
if (!v) { console.error("Usage: node submit-dispute-nyc.mjs <violation_number>"); process.exit(1); }
// Evidence is optional — if not listed in evidence.json the dispute is argument-only
run(v).catch((e) => { console.error(e); process.exit(1); });
