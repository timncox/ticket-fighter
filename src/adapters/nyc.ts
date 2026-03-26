import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import type {
  CityAdapter,
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
// Constants
// ---------------------------------------------------------------------------

const LOOKUP_URL =
  "https://a836-citypay.nyc.gov/citypay/Parking?stage=procurement";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const LOCALE = "en-US";

// ---------------------------------------------------------------------------
// Helper: sleep
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// NYC DOF Adapter
// ---------------------------------------------------------------------------

export const nycAdapter: CityAdapter = {
  cityId: "nyc",
  displayName: "New York City",

  // -------------------------------------------------------------------------
  // lookupTickets
  // -------------------------------------------------------------------------
  async lookupTickets(
    plate: string,
    state: string,
    type: string
  ): Promise<Ticket[]> {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        locale: LOCALE,
      });
      const page = await context.newPage();

      await page.goto(LOOKUP_URL, { waitUntil: "networkidle" });
      await sleep(3000);

      // Select the "License Plate" tab if not already active
      const plateTab = page.locator(
        "button:has-text('License Plate'), a:has-text('License Plate'), [role='tab']:has-text('License Plate')"
      );
      if (await plateTab.count() > 0) {
        await plateTab.first().click();
        await sleep(1000);
      }

      // Fill plate number
      const plateInput = page.locator(
        "input[name*='plate'], input[id*='plate'], input[placeholder*='plate' i], input[placeholder*='Plate' i]"
      );
      await plateInput.first().fill(plate);

      // Select state via searchable combo
      const stateCombo = page.locator(
        "select[name*='state' i], [placeholder*='state' i], [aria-label*='state' i], select[id*='state' i]"
      );
      if (await stateCombo.count() > 0) {
        const tag = await stateCombo.first().evaluate((el) =>
          el.tagName.toLowerCase()
        );
        if (tag === "select") {
          await stateCombo.first().selectOption({ label: state });
        } else {
          await stateCombo.first().fill(state);
          await sleep(500);
          const option = page.locator(`li:has-text("${state}")`).first();
          if (await option.count() > 0) await option.click();
        }
      }

      // Select plate type via searchable combo
      const typeCombo = page.locator(
        "select[name*='type' i], [placeholder*='type' i], [aria-label*='type' i], select[id*='type' i]"
      );
      if (await typeCombo.count() > 0) {
        const tag = await typeCombo.first().evaluate((el) =>
          el.tagName.toLowerCase()
        );
        if (tag === "select") {
          await typeCombo.first().selectOption({ label: type });
        } else {
          await typeCombo.first().fill(type);
          await sleep(500);
          const option = page.locator(`li:has-text("${type}")`).first();
          if (await option.count() > 0) await option.click();
        }
      }

      // Submit the form (reCAPTCHA fires invisibly on submit)
      const submitBtn = page.locator(
        "button[type='submit'], input[type='submit'], button:has-text('Search'), button:has-text('Find')"
      );
      await submitBtn.first().click();

      // Wait for results
      await page.waitForLoadState("networkidle");
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

        // NYC CityPay typically shows: violation#, date, code, description, amount, status
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
  },

  // -------------------------------------------------------------------------
  // getTicketDetails
  // -------------------------------------------------------------------------
  async getTicketDetails(violationNumber: string): Promise<TicketDetail> {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        locale: LOCALE,
      });
      const page = await context.newPage();

      await page.goto(LOOKUP_URL, { waitUntil: "networkidle" });
      await sleep(3000);

      // Try violation number lookup tab
      const violationTab = page.locator(
        "button:has-text('Violation'), a:has-text('Violation'), [role='tab']:has-text('Violation')"
      );
      if (await violationTab.count() > 0) {
        await violationTab.first().click();
        await sleep(1000);
      }

      const violationInput = page.locator(
        "input[name*='violation' i], input[id*='violation' i], input[placeholder*='violation' i]"
      );
      if (await violationInput.count() > 0) {
        await violationInput.first().fill(violationNumber);
      }

      const submitBtn = page.locator(
        "button[type='submit'], input[type='submit'], button:has-text('Search'), button:has-text('Find')"
      );
      await submitBtn.first().click();

      await page.waitForLoadState("networkidle");
      await sleep(3000);

      // Collect all visible label/value pairs as rawData
      const rawData: Record<string, string> = {};
      const labelledFields = await page.$$eval(
        "[class*='label'], [class*='field'], dt, th",
        (els) =>
          els.map((el) => ({
            label: el.textContent?.trim() ?? "",
            value:
              el.nextElementSibling?.textContent?.trim() ??
              (el as HTMLElement).dataset["value"] ??
              "",
          }))
      );
      for (const { label, value } of labelledFields) {
        if (label) rawData[label] = value;
      }

      // Extract key fields with fallbacks
      const violationCode =
        rawData["Violation Code"] ?? rawData["Code"] ?? "";
      const codeInfo = NYC_CODES[violationCode];

      return {
        violationNumber,
        dateIssued: rawData["Issue Date"] ?? rawData["Date Issued"] ?? "",
        violationCode,
        description:
          rawData["Violation Description"] ??
          rawData["Description"] ??
          codeInfo?.description ??
          "",
        amount:
          parseFloat(
            (rawData["Fine Amount"] ?? rawData["Amount"] ?? "0").replace(
              /[^0-9.]/g,
              ""
            )
          ) || 0,
        status: rawData["Status"] ?? "unknown",
        location:
          rawData["Location"] ??
          rawData["Street"] ??
          rawData["Address"] ??
          "",
        city: "nyc",
        plate: rawData["Plate"] ?? rawData["License Plate"] ?? "",
        vehicleMake: rawData["Make"] ?? rawData["Vehicle Make"],
        vehicleModel: rawData["Model"] ?? rawData["Vehicle Model"],
        vehicleColor: rawData["Color"] ?? rawData["Vehicle Color"],
        officerNotes: rawData["Officer Notes"] ?? rawData["Notes"],
        meterNumber: rawData["Meter Number"] ?? rawData["Meter"],
        photoUrls: [],
        rawData,
      };
    } finally {
      await browser.close();
    }
  },

  // -------------------------------------------------------------------------
  // getDisputeFormStructure
  // -------------------------------------------------------------------------
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
      acceptedFileTypes: ["pdf", "jpg", "jpeg", "png"],
      notes:
        "NYC parking disputes are submitted to the NYC Department of Finance (DOF) " +
        "via the Online Dispute Portal. You have 30 days from the violation date to " +
        "dispute by mail or in person, or 30 days from the first notice to dispute " +
        "online. Disputes for dismissed tickets are not necessary. Supporting " +
        "evidence (photos, receipts, permits) significantly improves outcomes.",
    };
  },

  // -------------------------------------------------------------------------
  // submitDispute
  // -------------------------------------------------------------------------
  async submitDispute(
    _violationNumber: string,
    _args: string,
    _evidencePaths: string[]
  ): Promise<DisputeConfirmation> {
    throw new Error(
      "Automated dispute submission is not supported for NYC because the " +
        "CityPay portal uses reCAPTCHA, which requires human interaction to " +
        "complete. To dispute this ticket, please visit the NYC DOF Online " +
        "Dispute Portal at https://a836-citypay.nyc.gov/citypay/Parking and " +
        "submit your dispute manually using the argument and evidence files " +
        "prepared by this tool."
    );
  },

  // -------------------------------------------------------------------------
  // checkDisposition
  // -------------------------------------------------------------------------
  async checkDisposition(violationNumber: string): Promise<DisputeStatus> {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        locale: LOCALE,
      });
      const page = await context.newPage();

      await page.goto(LOOKUP_URL, { waitUntil: "networkidle" });
      await sleep(3000);

      // Navigate to violation number lookup
      const violationTab = page.locator(
        "button:has-text('Violation'), a:has-text('Violation'), [role='tab']:has-text('Violation')"
      );
      if (await violationTab.count() > 0) {
        await violationTab.first().click();
        await sleep(1000);
      }

      const violationInput = page.locator(
        "input[name*='violation' i], input[id*='violation' i], input[placeholder*='violation' i]"
      );
      if (await violationInput.count() > 0) {
        await violationInput.first().fill(violationNumber);
      }

      const submitBtn = page.locator(
        "button[type='submit'], input[type='submit'], button:has-text('Search'), button:has-text('Find')"
      );
      await submitBtn.first().click();

      await page.waitForLoadState("networkidle");
      await sleep(3000);

      const pageText = await page.innerText("body");

      // Derive status from page content
      let status: DisputeStatus["status"] = "unknown";
      let disposition: DisputeStatus["disposition"] = null;
      let details: string | undefined;
      let amount: number | undefined;
      let decisionDate: string | undefined;

      const lower = pageText.toLowerCase();

      if (lower.includes("dismissed") || lower.includes("not guilty")) {
        status = "decided";
        disposition = "dismissed";
      } else if (lower.includes("guilty") && !lower.includes("not guilty")) {
        status = "decided";
        disposition = "guilty";
      } else if (lower.includes("reduced")) {
        status = "decided";
        disposition = "reduced";
      } else if (lower.includes("scheduled") || lower.includes("hearing")) {
        status = "scheduled";
      } else if (lower.includes("pending") || lower.includes("open")) {
        status = "pending";
      }

      // Try to extract an amount
      const amountMatch = pageText.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
      if (amountMatch) {
        amount = parseFloat(amountMatch[1].replace(/,/g, ""));
      }

      // Try to extract a date near "decision" or "hearing"
      const dateMatch = pageText.match(
        /(?:decision|decided|hearing)\s*(?:date)?[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i
      );
      if (dateMatch) {
        decisionDate = dateMatch[1];
      }

      details = `Scraped status from NYC CityPay portal for violation ${violationNumber}.`;

      return {
        violationNumber,
        city: "nyc",
        status,
        disposition,
        amount,
        decisionDate,
        details,
      };
    } finally {
      await browser.close();
    }
  },
};
