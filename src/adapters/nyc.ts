import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import {
  isCaptchaSolverEnabled,
  solveRecaptchaV2,
  extractRecaptchaSiteKey,
  injectRecaptchaToken,
} from "../captcha-solver.js";
import type {
  CityAdapter,
  Plate,
  Ticket,
  TicketDetail,
  DisputeFormFields,
  DisputeConfirmation,
  DisputeStatus,
} from "./types.js";

// ---------------------------------------------------------------------------
// Violation code database
// ---------------------------------------------------------------------------

interface ViolationCode {
  description: string;
  fine: number;
  defenses: string[];
}

const codesPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../codes/nyc-codes.json"
);

const NYC_CODES: Record<string, ViolationCode> = JSON.parse(
  fs.readFileSync(codesPath, "utf-8")
);

// ---------------------------------------------------------------------------
// NYC Open Data API (SODA 2.0)
// ---------------------------------------------------------------------------

const API_BASE = "https://data.cityofnewyork.us/resource/nc67-uf89.json";

interface SodaViolation {
  plate: string;
  state: string;
  license_type: string;
  summons_number: string;
  issue_date: string;
  violation_time: string;
  violation: string;
  judgment_entry_date?: string;
  fine_amount: string;
  penalty_amount: string;
  interest_amount: string;
  reduction_amount: string;
  payment_amount: string;
  amount_due: string;
  precinct: string;
  county: string;
  issuing_agency: string;
  violation_status?: string;
  summons_image?: { url: string; description?: string };
}

async function queryApi(params: string): Promise<SodaViolation[]> {
  const url = `${API_BASE}?${params}`;
  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`NYC Open Data API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json() as Promise<SodaViolation[]>;
}

function parseAmount(s: string | undefined): number {
  return parseFloat((s ?? "0").replace(/[^0-9.]/g, "")) || 0;
}

function formatDate(isoOrSlash: string): string {
  // API returns "MM/DD/YYYY" or ISO — normalize
  if (!isoOrSlash) return "";
  if (isoOrSlash.includes("T")) {
    return new Date(isoOrSlash).toLocaleDateString("en-US");
  }
  return isoOrSlash;
}

function mapStatus(v: SodaViolation): string {
  if (!v.violation_status) {
    return parseAmount(v.amount_due) > 0 ? "open" : "paid";
  }
  const s = v.violation_status.toLowerCase();
  if (s.includes("not guilty")) return "dismissed";
  if (s.includes("guilty") && s.includes("reduction")) return "reduced";
  if (s.includes("guilty")) return "guilty";
  if (s.includes("pending") || s.includes("adjournment")) return "pending";
  if (s.includes("appeal")) return "appeal";
  return v.violation_status;
}

function violationToTicket(v: SodaViolation): Ticket {
  const code = v.violation?.replace(/[^0-9]/g, "") ?? "";
  return {
    violationNumber: v.summons_number,
    dateIssued: formatDate(v.issue_date),
    violationCode: code,
    description: v.violation ?? NYC_CODES[code]?.description ?? "Unknown violation",
    amount: parseAmount(v.amount_due),
    status: mapStatus(v),
    location: v.county ? `Precinct ${v.precinct}, ${v.county}` : v.precinct ?? "",
    city: "nyc",
    plate: v.plate,
  };
}

// ---------------------------------------------------------------------------
// CityPay scraper fallback (non-headless — user solves reCAPTCHA)
// ---------------------------------------------------------------------------

const LOOKUP_URL =
  "https://a836-citypay.nyc.gov/citypay/Parking?stage=procurement";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function chosenSelect(
  page: import("playwright").Page,
  selectId: string,
  value: string
): Promise<void> {
  const chosenContainer = page.locator(`${selectId}_chosen`);
  if (await chosenContainer.count() > 0) {
    await chosenContainer.click();
    await sleep(300);
    const searchInput = chosenContainer.locator("input[type='text']");
    if (await searchInput.count() > 0) {
      await searchInput.fill(value);
      await sleep(300);
    }
    const result = chosenContainer.locator(
      "li.active-result:has-text('" + value + "')"
    );
    if (await result.count() > 0) {
      await result.first().click();
    } else {
      const anyResult = chosenContainer.locator("li.active-result").first();
      if (await anyResult.count() > 0) await anyResult.click();
    }
  } else {
    const sel = page.locator(selectId);
    await sel.selectOption({ label: value });
  }
}

async function scrapeCityPay(
  plate: string,
  state: string,
  type: string
): Promise<Ticket[]> {
  const headless = isCaptchaSolverEnabled();
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "en-US",
    });
    const page = await context.newPage();

    await page.goto(LOOKUP_URL, { waitUntil: "networkidle" });
    await sleep(3000);

    // Switch to License Plate tab. The page ships both tab panels in the DOM,
    // so we MUST click the tab AND scope every subsequent selector to the
    // License Plate form — otherwise "button[type=submit]" picks up the
    // Parking Violation form's submit and triggers "Violation number is empty".
    const plateTab = page.locator(
      "a:has-text('Search By License Plate'), button:has-text('Search By License Plate'), [role='tab']:has-text('Search By License Plate')"
    );
    if (await plateTab.count() === 0) {
      throw new Error("CityPay: could not find 'Search By License Plate' tab");
    }
    await plateTab.first().click();
    await sleep(1000);

    // Scope to the plate form by finding an input that's clearly plate-specific,
    // then walking up to its enclosing <form>. Everything below uses plateForm.
    const plateInput = page.locator(
      "input[name*='plate' i], input[id*='plate' i], input[placeholder*='plate' i]"
    ).first();
    const plateForm = plateInput.locator("xpath=ancestor::form[1]");
    if (await plateForm.count() === 0) {
      throw new Error("CityPay: could not locate plate lookup form");
    }

    await plateInput.fill(plate);

    // State and type dropdowns (Chosen widgets live inside the plate form)
    await chosenSelect(page, "#PLATE_STATE", state);
    await chosenSelect(page, "#PLATE_TYPE", type);

    // Solve CAPTCHA automatically if solver is available
    if (headless) {
      const siteKey = await extractRecaptchaSiteKey(page);
      if (siteKey) {
        const token = await solveRecaptchaV2(LOOKUP_URL, siteKey);
        await injectRecaptchaToken(page, token);
        await sleep(500);
      }
    }

    // Submit — scoped to the plate form so we can't click the parking-violation
    // tab's submit button by accident.
    const submitBtn = plateForm.locator(
      "button[type='submit'], input[type='submit']"
    ).first();
    if (await submitBtn.count() === 0) {
      throw new Error("CityPay: could not find submit button in plate form");
    }
    await submitBtn.evaluate((btn: HTMLElement) => btn.click());

    // Wait for results — if headless, CAPTCHA is already solved; if headed, user solves manually
    await page.waitForSelector("table tbody tr, .no-results, .error-message", {
      timeout: 120_000,
    }).catch(() => {});
    await sleep(3000);

    // Parse tickets from the results table
    const tickets: Ticket[] = [];
    const rows = page.locator("table tbody tr, [role='row']:not(:first-child)");
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const cells = row.locator("td, [role='cell']");
      const cellCount = await cells.count();
      if (cellCount < 3) continue;

      const cellTexts: string[] = [];
      for (let j = 0; j < cellCount; j++) {
        cellTexts.push((await cells.nth(j).innerText()).trim());
      }

      const violationNumber = cellTexts[0] ?? "";
      const dateIssued = cellTexts[1] ?? "";
      const violationCode = cellTexts[2] ?? "";
      const description =
        cellTexts[3] ??
        NYC_CODES[violationCode]?.description ??
        "Unknown violation";
      const amountStr = cellTexts[4] ?? "0";
      const amount = parseFloat(amountStr.replace(/[^0-9.]/g, "")) || 0;
      const status = cellTexts[5] ?? "unknown";

      if (!violationNumber) continue;

      tickets.push({
        violationNumber,
        dateIssued,
        violationCode,
        description,
        amount,
        status,
        location: cellTexts[6] ?? "",
        city: "nyc",
        plate,
      });
    }

    return tickets;
  } finally {
    await browser.close();
  }
}

export async function captureSummonsImageFromCityPay(
  plate: string,
  state: string,
  type: string,
  violationNumber: string,
  outputPath: string
): Promise<boolean> {
  const headless = isCaptchaSolverEnabled();
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "en-US",
    });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1400, height: 1800 });

    await page.goto(LOOKUP_URL, { waitUntil: "networkidle" });
    await sleep(3000);

    const plateTab = page.locator(
      "a:has-text('Search By License Plate'), button:has-text('Search By License Plate'), [role='tab']:has-text('Search By License Plate')"
    );
    if (await plateTab.count() === 0) return false;
    await plateTab.first().click();
    await sleep(1000);

    const plateInput = page.locator(
      "input[name*='plate' i], input[id*='plate' i], input[placeholder*='plate' i]"
    ).first();
    const plateForm = plateInput.locator("xpath=ancestor::form[1]");
    if (await plateForm.count() === 0) return false;

    await plateInput.fill(plate);
    await chosenSelect(page, "#PLATE_STATE", state);
    await chosenSelect(page, "#PLATE_TYPE", type);

    if (headless) {
      const siteKey = await extractRecaptchaSiteKey(page);
      if (siteKey) {
        const token = await solveRecaptchaV2(LOOKUP_URL, siteKey);
        await injectRecaptchaToken(page, token);
        await sleep(500);
      }
    }

    const submitBtn = plateForm.locator(
      "button[type='submit'], input[type='submit']"
    ).first();
    if (await submitBtn.count() === 0) return false;
    await submitBtn.evaluate((btn: HTMLElement) => btn.click());

    await page.waitForSelector("table tbody tr, .no-results, .error-message", {
      timeout: 120_000,
    }).catch(() => {});
    await sleep(3000);

    const targetRow = page.locator(
      `table tbody tr:has(td:first-child:text-is("${violationNumber}"))`
    ).first();
    if (await targetRow.count() === 0) return false;

    // The summons image is exposed either as a direct ShowImage link in the
    // row, or via a "View Image" link inside the detail panel after clicking
    // the row. Try both, capturing the image from inside the authenticated
    // session so Akamai's ShowImage gate is satisfied.
    const captureFromLink = async (
      link: import("playwright").Locator
    ): Promise<boolean> => {
      const [newPage] = await Promise.all([
        context.waitForEvent("page", { timeout: 5000 }).catch(() => null),
        link.click().catch(() => undefined),
      ]);
      const imgPage = newPage ?? page;
      await imgPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await sleep(1500);
      const img = imgPage.locator("img").first();
      if (await img.count() > 0) {
        try {
          await img.waitFor({ state: "visible", timeout: 5000 });
          await img.screenshot({ path: outputPath });
          return true;
        } catch {
          // Fall through to full-page capture.
        }
      }
      await imgPage.screenshot({ path: outputPath, fullPage: true });
      return true;
    };

    const rowImageLink = targetRow.locator(
      "a[href*='ShowImage'], a[href*='showImage'], a:has-text('Image')"
    ).first();
    if (await rowImageLink.count() > 0) {
      if (await captureFromLink(rowImageLink)) return true;
    }

    // Otherwise click into detail first, then look for the image link there.
    const detailLink = targetRow.locator("a, button").first();
    if (await detailLink.count() > 0) {
      try {
        await detailLink.click();
        await sleep(1500);
        const detailImageLink = page.locator(
          "a[href*='ShowImage'], a[href*='showImage'], a:has-text('View Image'), a:has-text('Summons Image')"
        ).first();
        if (await detailImageLink.count() > 0) {
          if (await captureFromLink(detailImageLink)) return true;
        }
      } catch {
        // No-op.
      }
    }

    return false;
  } catch {
    return false;
  } finally {
    await browser.close();
  }
}

async function scrapeCityPayDetail(
  plate: string,
  state: string,
  type: string,
  violationNumber: string
): Promise<TicketDetail | null> {
  const headless = isCaptchaSolverEnabled();
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "en-US",
    });
    const page = await context.newPage();

    await page.goto(LOOKUP_URL, { waitUntil: "networkidle" });
    await sleep(3000);

    const plateTab = page.locator(
      "a:has-text('Search By License Plate'), button:has-text('Search By License Plate'), [role='tab']:has-text('Search By License Plate')"
    );
    if (await plateTab.count() === 0) {
      throw new Error("CityPay: could not find 'Search By License Plate' tab");
    }
    await plateTab.first().click();
    await sleep(1000);

    const plateInput = page.locator(
      "input[name*='plate' i], input[id*='plate' i], input[placeholder*='plate' i]"
    ).first();
    const plateForm = plateInput.locator("xpath=ancestor::form[1]");
    if (await plateForm.count() === 0) {
      throw new Error("CityPay: could not locate plate lookup form");
    }
    await plateInput.fill(plate);
    await chosenSelect(page, "#PLATE_STATE", state);
    await chosenSelect(page, "#PLATE_TYPE", type);

    if (headless) {
      const siteKey = await extractRecaptchaSiteKey(page);
      if (siteKey) {
        const token = await solveRecaptchaV2(LOOKUP_URL, siteKey);
        await injectRecaptchaToken(page, token);
        await sleep(500);
      }
    }

    const submitBtn = plateForm.locator(
      "button[type='submit'], input[type='submit']"
    ).first();
    if (await submitBtn.count() === 0) {
      throw new Error("CityPay: could not find submit button in plate form");
    }
    await submitBtn.evaluate((btn: HTMLElement) => btn.click());

    await page.waitForSelector("table tbody tr, .no-results, .error-message", {
      timeout: 120_000,
    }).catch(() => {});
    await sleep(3000);

    // Find the row whose first cell matches the requested violation number.
    const targetRow = page.locator(
      `table tbody tr:has(td:first-child:text-is("${violationNumber}"))`
    ).first();
    if (await targetRow.count() === 0) {
      return null;
    }

    // Capture the summary row's cell texts as a baseline.
    const cells = targetRow.locator("td, [role='cell']");
    const cellCount = await cells.count();
    const cellTexts: string[] = [];
    for (let j = 0; j < cellCount; j++) {
      cellTexts.push((await cells.nth(j).innerText()).trim());
    }

    const dateIssued = cellTexts[1] ?? "";
    const violationCode = cellTexts[2] ?? "";
    const description =
      cellTexts[3] ??
      NYC_CODES[violationCode]?.description ??
      "Unknown violation";
    const amount = parseFloat((cellTexts[4] ?? "0").replace(/[^0-9.]/g, "")) || 0;
    const status = cellTexts[5] ?? "unknown";

    // Try to open the detail view by clicking the first link or button in the row.
    const detailKv: Record<string, string> = {};
    const clickable = targetRow.locator("a, button").first();
    if (await clickable.count() > 0) {
      try {
        await clickable.click();
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await sleep(1500);

        // CityPay's detail panel typically renders label/value pairs as
        // <dt>/<dd>, <th>/<td>, or "Label: Value" text. Probe each.
        const dts = page.locator("dt");
        const dtCount = await dts.count();
        for (let i = 0; i < dtCount; i++) {
          const label = (await dts.nth(i).innerText()).trim().replace(/:$/, "");
          const value = await dts.nth(i).locator("xpath=following-sibling::dd[1]").innerText().catch(() => "");
          if (label && value) detailKv[label] = value.trim();
        }
        const labelCells = page.locator("th, td.label, td.field-label");
        const lcCount = await labelCells.count();
        for (let i = 0; i < lcCount; i++) {
          const label = (await labelCells.nth(i).innerText()).trim().replace(/:$/, "");
          const value = await labelCells.nth(i).locator("xpath=following-sibling::td[1]").innerText().catch(() => "");
          if (label && value && !detailKv[label]) detailKv[label] = value.trim();
        }
      } catch {
        // Detail panel didn't open — fall through to row-only data.
      }
    }

    const find = (...keys: string[]): string => {
      for (const k of keys) {
        for (const [label, value] of Object.entries(detailKv)) {
          if (label.toLowerCase().includes(k.toLowerCase())) return value;
        }
      }
      return "";
    };

    const street = find("street name", "street", "intersecting", "house number", "location");
    const violationTime = find("violation time", "issue time", "time");
    const vehicleBody = find("body type", "vehicle body");
    const vehicleMake = find("make", "vehicle make");
    const vehicleColor = find("color");
    const precinct = find("precinct");
    const county = find("county", "county code");
    const issuingAgency = find("agency", "issuing");

    const locationParts = [street, precinct ? `Precinct ${precinct}` : "", county]
      .filter(Boolean);
    const location = locationParts.length > 0
      ? locationParts.join(", ")
      : (cellTexts[6] ?? "");

    return {
      violationNumber,
      dateIssued,
      violationCode,
      description,
      amount,
      status,
      location,
      city: "nyc",
      plate,
      vehicleMake: vehicleMake || undefined,
      vehicleColor: vehicleColor || undefined,
      rawData: {
        street,
        violation_time: violationTime,
        body_type: vehicleBody,
        make: vehicleMake,
        color: vehicleColor,
        precinct,
        county,
        issuing_agency: issuingAgency,
        source: "citypay_scraper",
        ...detailKv,
      },
      photoUrls: [],
    };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// NYC DOF Adapter — Open Data API + CityPay scraper fallback
// ---------------------------------------------------------------------------

export const nycAdapter: CityAdapter = {
  cityId: "nyc",
  displayName: "New York City",

  async lookupTickets(
    plate: string,
    state: string,
    type: string
  ): Promise<Ticket[]> {
    // Primary: Open Data API (fast, no CAPTCHA, but can lag weeks behind)
    const where = encodeURIComponent(
      `plate='${plate.toUpperCase()}' AND state='${state.toUpperCase()}'`
    );
    const apiResults = await queryApi(
      `$where=${where}&$order=issue_date DESC&$limit=50`
    );
    const apiTickets = apiResults.map(violationToTicket);

    // Check if API data is stale — if newest ticket is >30 days old,
    // fall back to CityPay scraper for real-time results
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const newestDate = apiResults.length > 0
      ? new Date(apiResults[0].issue_date).getTime()
      : 0;

    if (newestDate < thirtyDaysAgo) {
      // API may be stale — try CityPay scraper (opens browser for reCAPTCHA)
      try {
        const scraperTickets = await scrapeCityPay(plate, state, type);
        if (scraperTickets.length > 0) {
          // Merge: scraper results + API results not already in scraper set
          const scraperNums = new Set(scraperTickets.map((t) => t.violationNumber));
          const merged = [
            ...scraperTickets,
            ...apiTickets.filter((t) => !scraperNums.has(t.violationNumber)),
          ];
          return merged;
        }
      } catch {
        // Scraper failed (CAPTCHA not solved, etc.) — return API results
      }
    }

    return apiTickets;
  },

  async getTicketDetails(
    violationNumber: string,
    plates?: Plate[]
  ): Promise<TicketDetail> {
    const results = await queryApi(
      `summons_number=${encodeURIComponent(violationNumber)}`
    );

    // API miss is common for recent tickets (Open Data lags 1-4 weeks).
    // Fall back to the CityPay scraper, iterating saved NYC plates.
    if (results.length === 0) {
      const nycPlates = (plates ?? []).filter((p) => p.city === "nyc");
      for (const p of nycPlates) {
        try {
          const detail = await scrapeCityPayDetail(
            p.number,
            p.state,
            p.type,
            violationNumber
          );
          if (detail) return detail;
        } catch {
          // Try next plate.
        }
      }
      throw new Error(`No violation found with number ${violationNumber}`);
    }

    const v = results[0];
    const code = v.violation?.replace(/[^0-9]/g, "") ?? "";
    const codeInfo = NYC_CODES[code];

    return {
      violationNumber: v.summons_number,
      dateIssued: formatDate(v.issue_date),
      violationCode: code,
      description: v.violation ?? codeInfo?.description ?? "",
      amount: parseAmount(v.amount_due),
      status: mapStatus(v),
      location: v.county ? `Precinct ${v.precinct}, ${v.county}` : v.precinct ?? "",
      city: "nyc",
      plate: v.plate,
      rawData: {
        fine_amount: v.fine_amount ?? "",
        penalty_amount: v.penalty_amount ?? "",
        interest_amount: v.interest_amount ?? "",
        reduction_amount: v.reduction_amount ?? "",
        payment_amount: v.payment_amount ?? "",
        amount_due: v.amount_due ?? "",
        violation_time: v.violation_time ?? "",
        issuing_agency: v.issuing_agency ?? "",
        precinct: v.precinct ?? "",
        county: v.county ?? "",
        violation_status: v.violation_status ?? "",
        judgment_entry_date: v.judgment_entry_date ?? "",
        summons_image_viewer_url: v.summons_image?.url ?? "",
      },
      photoUrls: [],
    };
  },

  getDisputeFormStructure(): DisputeFormFields {
    return {
      city: "nyc",
      requiredFields: [
        "violationNumber",
        "plate",
        "state",
        "argument",
        "name",
        "address",
        "email",
      ],
      maxArgumentLength: 5000,
      maxEvidenceFiles: 5,
      acceptedFileTypes: ["pdf", "jpg", "jpeg", "tiff", "bmp", "gif"],
      notes:
        "NYC parking disputes are submitted to the NYC Department of Finance (DOF) " +
        "via the Online Dispute Portal. You have 30 days from the violation date to " +
        "dispute by mail or in person, or 30 days from the first notice to dispute " +
        "online. Disputes for dismissed tickets are not necessary. Supporting " +
        "evidence (photos, receipts, permits) significantly improves outcomes.",
    };
  },

  async submitDispute(
    _violationNumber: string,
    _args: string,
    _evidencePaths: string[]
  ): Promise<DisputeConfirmation> {
    throw new Error(
      "Automated dispute submission is not supported for NYC. " +
        "To dispute this ticket, visit the NYC DOF Online Dispute Portal at " +
        "https://a836-citypay.nyc.gov/citypay/Parking and submit your dispute " +
        "manually using the argument and evidence files prepared by this tool."
    );
  },

  async checkDisposition(violationNumber: string): Promise<DisputeStatus> {
    const results = await queryApi(
      `summons_number=${encodeURIComponent(violationNumber)}`
    );

    if (results.length === 0) {
      return {
        violationNumber,
        city: "nyc",
        status: "unknown",
        disposition: null,
        details: "Violation not found in NYC Open Data.",
      };
    }

    const v = results[0];
    const statusStr = mapStatus(v);

    let status: DisputeStatus["status"] = "unknown";
    let disposition: DisputeStatus["disposition"] = null;

    if (statusStr === "dismissed") {
      status = "decided";
      disposition = "dismissed";
    } else if (statusStr === "guilty") {
      status = "decided";
      disposition = "guilty";
    } else if (statusStr === "reduced") {
      status = "decided";
      disposition = "reduced";
    } else if (statusStr === "pending" || statusStr === "appeal") {
      status = "pending";
    } else if (statusStr === "open" || statusStr === "paid") {
      status = "pending";
    }

    return {
      violationNumber,
      city: "nyc",
      status,
      disposition,
      amount: parseAmount(v.amount_due),
      decisionDate: v.judgment_entry_date ? formatDate(v.judgment_entry_date) : undefined,
      details: v.violation_status
        ? `Status: ${v.violation_status}`
        : `Amount due: $${parseAmount(v.amount_due).toFixed(2)}`,
    };
  },
};
