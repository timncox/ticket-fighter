#!/usr/bin/env node
// One-shot test for the new CityPay scraper fallback in analyze_ticket.
// Calls nycAdapter.getTicketDetails() with a violation number that the
// Open Data API doesn't have yet, so the scraper path is exercised.
//
// Usage: node scripts/test-analyze-fallback.mjs [violationNumber]
//
// A Chromium window will open. Solve the reCAPTCHA, then watch the terminal.

import { loadConfig } from "../dist/config.js";
import { nycAdapter } from "../dist/adapters/nyc.js";

const violationNumber = process.argv[2] ?? "9284668517";

const config = loadConfig();
const nycPlates = config.plates.filter((p) => p.city === "nyc");
console.log(`NYC plates loaded: ${nycPlates.map((p) => p.number).join(", ") || "(none)"}`);
if (nycPlates.length === 0) {
  console.error("No NYC plates saved — add one via manage_plates first.");
  process.exit(1);
}

console.log(`Calling getTicketDetails("${violationNumber}") with ${nycPlates.length} plate(s)…`);
console.log("A visible browser will open if no CAPTCHA_API_KEY is set.");

const start = Date.now();
try {
  const detail = await nycAdapter.getTicketDetails(violationNumber, config.plates);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== TicketDetail (${elapsed}s) ===`);
  console.log(JSON.stringify(detail, null, 2));
  console.log(`\nStreet extracted: ${detail.rawData?.street || "(empty — selector miss)"}`);
} catch (err) {
  console.error(`\nFailed after ${((Date.now() - start) / 1000).toFixed(1)}s:`, err.message);
  process.exit(2);
}
