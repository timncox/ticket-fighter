#!/usr/bin/env node
// Exercises the new summons-image capture path end-to-end:
// fetch ticket details from the API, run gatherEvidence, print the path
// of the saved PNG so it can be read with vision.
//
// Usage: node scripts/test-summons-image.mjs [violationNumber]
// Logs every step of the CityPay scraper via TF_DEBUG_SCRAPER=1.
process.env.TF_DEBUG_SCRAPER = "1";

import { loadConfig } from "../dist/config.js";
import { nycAdapter } from "../dist/adapters/nyc.js";
import { gatherEvidence } from "../dist/evidence.js";

const violationNumber = process.argv[2] ?? "9284668517";
const config = loadConfig();

console.log(`Fetching details for ${violationNumber}…`);
const detail = await nycAdapter.getTicketDetails(violationNumber, config.plates);
console.log(`viewer URL: ${detail.rawData?.summons_image_viewer_url || "(none)"}`);

console.log("\nRunning gatherEvidence (will open headless Chromium)…");
const start = Date.now();
const evidence = await gatherEvidence(detail);
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log(`\n=== Evidence (${elapsed}s) ===`);
console.log(`summonsImagePath: ${evidence.summonsImagePath || "(null)"}`);
console.log(`streetViewImages: ${evidence.streetViewImages.length} captured`);
console.log(`ticketErrors:`);
for (const e of evidence.ticketErrors) console.log(`  - ${e}`);
