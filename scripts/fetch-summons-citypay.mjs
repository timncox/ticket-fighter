#!/usr/bin/env node
// Fetch summons detail pages via NYC CityPay (Search By Parking Violation tab).
// Runs HEADED. Once user solves reCAPTCHA, we auto-detect the token and submit.
// Saves a full-page PNG + HTML for each violation to ~/.ticket-fighter/decisions/.

import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT_DIR = path.join(os.homedir(), ".ticket-fighter", "decisions");
fs.mkdirSync(OUT_DIR, { recursive: true });

const CITYPAY_URL =
  "https://a836-citypay.nyc.gov/citypay/Parking?stage=procurement";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait for EITHER the reCAPTCHA token to appear OR the page to navigate
// (CityPay's reCAPTCHA callback auto-submits the form on solve).
async function waitForCaptchaOrNav(page, timeoutMs = 300_000) {
  const start = Date.now();
  let navigated = false;
  const navPromise = page
    .waitForNavigation({ timeout: timeoutMs })
    .then(() => { navigated = true; })
    .catch(() => {});
  while (Date.now() - start < timeoutMs) {
    if (navigated) return "navigated";
    const token = await page.evaluate(() => {
      const el = document.querySelector(
        "textarea[name='g-recaptcha-response'], input[name='g-recaptcha-response']"
      );
      return el?.value ?? "";
    }).catch(() => "__ctx_destroyed__");
    if (token === "__ctx_destroyed__") {
      await navPromise.catch(() => {});
      return "navigated";
    }
    if (token && token.length > 20) {
      return "token";
    }
    await sleep(800);
  }
  return "timeout";
}

async function searchOne(page, summons) {
  console.log(`\n=== ${summons} ===`);
  await page.goto(CITYPAY_URL, { waitUntil: "domcontentloaded" });
  await sleep(2500);

  const vInput = page.locator(
    "input[name*='violation' i], input[id*='violation' i], input[placeholder*='Violation Number' i]"
  ).first();

  if (await vInput.count() === 0) {
    throw new Error("could not find violation-number input");
  }

  const vForm = vInput.locator("xpath=ancestor::form[1]");
  await vInput.fill(summons);
  await sleep(400);

  const captchaFrame = page.locator("iframe[src*='recaptcha']");
  let outcome = "no-captcha";
  if (await captchaFrame.count() > 0) {
    console.log(`[${summons}] reCAPTCHA present — solve it in the browser window (up to 5 min)…`);
    outcome = await waitForCaptchaOrNav(page);
    console.log(`[${summons}] CAPTCHA outcome: ${outcome}`);
    if (outcome === "timeout") throw new Error("CAPTCHA not solved in time");
  }

  // If solve didn't auto-navigate, click submit ourselves
  if (outcome !== "navigated") {
    const submit = vForm.locator("button[type='submit'], input[type='submit']").first();
    await submit.evaluate((b) => b.click()).catch((e) => {
      console.log(`[${summons}] submit click note: ${e.message}`);
    });
  }

  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await sleep(3000);

  const pngPath = path.join(OUT_DIR, `citypay-${summons}.png`);
  const htmlPath = path.join(OUT_DIR, `citypay-${summons}.html`);
  await page.screenshot({ path: pngPath, fullPage: true });
  fs.writeFileSync(htmlPath, await page.content());
  console.log(`[${summons}] saved ${pngPath} (${fs.statSync(pngPath).size} bytes)`);

  // Try to follow a "View Summons"/"Image" link if present
  const viewLink = page.locator(
    "a:has-text('View Summons'), a:has-text('Summons Image'), a:has-text('Image'), a[href*='ShowImage']"
  ).first();
  if (await viewLink.count() > 0) {
    const href = await viewLink.getAttribute("href");
    console.log(`[${summons}] following View Summons: ${href}`);
    const [popup] = await Promise.all([
      page.context().waitForEvent("page", { timeout: 10_000 }).catch(() => null),
      viewLink.click(),
    ]);
    const target = popup || page;
    await target.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    await sleep(3000);
    const imgPath = path.join(OUT_DIR, `summons-${summons}.png`);
    await target.screenshot({ path: imgPath, fullPage: true });
    fs.writeFileSync(path.join(OUT_DIR, `summons-${summons}.html`), await target.content());
    console.log(`[${summons}] saved ${imgPath}`);
    if (popup) await popup.close();
  } else {
    console.log(`[${summons}] no View Summons link — citypay-*.png has the page content`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error("Usage: node fetch-summons-citypay.mjs <summons> [<summons>...]");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent: UA, locale: "en-US" });
  const page = await context.newPage();

  for (const s of args) {
    try {
      await searchOne(page, s);
    } catch (e) {
      console.error(`[${s}] ERROR: ${e.message}`);
    }
  }

  console.log("\nDone.");
  await sleep(3_000);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
