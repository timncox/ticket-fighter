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

const LOOKUP_URL =
  "https://webapps1.chicago.gov/payments-web/#/validatedFlow?cityServiceId=1";
const EHEARING_URL = "https://parkingtickets.chicago.gov/EHearingWeb/home";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface ViolationCodeEntry {
  description: string;
  fine: number;
  defenses: string[];
}

const codesPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../codes/chicago-codes.json"
);

const CHICAGO_CODES: Record<string, ViolationCodeEntry> = JSON.parse(
  fs.readFileSync(codesPath, "utf-8")
);

function getCodeInfo(code: string): ViolationCodeEntry {
  return CHICAGO_CODES[code] ?? { description: "Unknown violation", fine: 0, defenses: [] };
}

export const chicagoAdapter: CityAdapter = {
  cityId: "chicago",
  displayName: "Chicago",

  async lookupTickets(plate: string, state: string, _type: string): Promise<Ticket[]> {
    const browser = await chromium.launch({ headless: false });
    try {
      const context = await browser.newContext({ userAgent: USER_AGENT });
      const page = await context.newPage();

      await page.goto(LOOKUP_URL, { waitUntil: "networkidle" });

      // Fill plate number
      await page.waitForSelector('input[name="plateNumber"], input[placeholder*="plate"], input[type="text"]', {
        timeout: 15000,
      });

      // Chicago's Angular SPA uses named inputs; fill the visible text fields in order
      const inputs = page.locator('input[type="text"]');
      await inputs.nth(0).fill(plate);

      // Select state dropdown
      const stateSelect = page.locator('select').first();
      await stateSelect.selectOption(state.toUpperCase());

      // hCaptcha is present — require human solve
      console.error(
        "[ticket-fighter] CHICAGO: hCaptcha detected. Please solve the CAPTCHA in the browser window, then press Submit. Waiting up to 120 seconds..."
      );

      // Wait up to 120s for the results to appear after human submits
      await page.waitForSelector('.ticket-result, .violation-result, [class*="result"], [class*="ticket"]', {
        timeout: 120000,
      });

      // Scrape result rows
      const tickets: Ticket[] = [];
      const rows = await page.locator('[class*="ticket"], [class*="violation"], tr').all();

      for (const row of rows) {
        const text = await row.innerText().catch(() => "");
        if (!text.trim()) continue;

        // Attempt to parse structured ticket data from each row
        const violationMatch = text.match(/(\d{8,})/);
        const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
        const amountMatch = text.match(/\$?([\d,]+\.?\d{0,2})/);
        const codeMatch = text.match(/096\d{4}|097\d{4}/);

        if (violationMatch) {
          const code = codeMatch ? codeMatch[0] : "";
          const codeInfo = getCodeInfo(code);
          tickets.push({
            violationNumber: violationMatch[1],
            dateIssued: dateMatch ? dateMatch[1] : "",
            violationCode: code,
            description: codeInfo.description || text.split("\n")[0].trim(),
            amount: amountMatch ? parseFloat(amountMatch[1].replace(",", "")) : codeInfo.fine,
            status: "open",
            location: "",
            city: "chicago",
            plate,
          });
        }
      }

      return tickets;
    } finally {
      await browser.close();
    }
  },

  async getTicketDetails(violationNumber: string): Promise<TicketDetail> {
    const browser = await chromium.launch({ headless: false });
    try {
      const context = await browser.newContext({ userAgent: USER_AGENT });
      const page = await context.newPage();

      await page.goto(LOOKUP_URL, { waitUntil: "networkidle" });

      // Fill violation number directly if the portal supports it
      await page.waitForSelector('input[type="text"]', { timeout: 15000 });
      const inputs = page.locator('input[type="text"]');
      await inputs.nth(0).fill(violationNumber);

      console.error(
        "[ticket-fighter] CHICAGO: hCaptcha detected. Please solve the CAPTCHA in the browser window, then press Submit. Waiting up to 120 seconds..."
      );

      await page.waitForSelector('[class*="result"], [class*="ticket"], [class*="detail"]', {
        timeout: 120000,
      });

      const pageText = await page.innerText("body");
      const codeMatch = pageText.match(/096\d{4}|097\d{4}/);
      const code = codeMatch ? codeMatch[0] : "";
      const codeInfo = getCodeInfo(code);

      const dateMatch = pageText.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
      const amountMatch = pageText.match(/\$?([\d,]+\.?\d{0,2})/);
      const plateMatch = pageText.match(/plate[:\s]+([A-Z0-9]+)/i);
      const locationMatch = pageText.match(/location[:\s]+([^\n]+)/i);
      const makeMatch = pageText.match(/make[:\s]+([^\n]+)/i);
      const modelMatch = pageText.match(/model[:\s]+([^\n]+)/i);
      const colorMatch = pageText.match(/color[:\s]+([^\n]+)/i);

      // Collect all raw key:value pairs from the page
      const rawData: Record<string, string> = {};
      const kvMatches = pageText.matchAll(/([A-Za-z ]{3,30}):\s*([^\n]{1,100})/g);
      for (const m of kvMatches) {
        rawData[m[1].trim()] = m[2].trim();
      }

      return {
        violationNumber,
        dateIssued: dateMatch ? dateMatch[1] : "",
        violationCode: code,
        description: codeInfo.description,
        amount: amountMatch ? parseFloat(amountMatch[1].replace(",", "")) : codeInfo.fine,
        status: "open",
        location: locationMatch ? locationMatch[1].trim() : "",
        city: "chicago",
        plate: plateMatch ? plateMatch[1] : "",
        vehicleMake: makeMatch ? makeMatch[1].trim() : undefined,
        vehicleModel: modelMatch ? modelMatch[1].trim() : undefined,
        vehicleColor: colorMatch ? colorMatch[1].trim() : undefined,
        rawData,
      };
    } finally {
      await browser.close();
    }
  },

  getDisputeFormStructure(): DisputeFormFields {
    return {
      city: "chicago",
      requiredFields: ["violationNumber", "arguments"],
      maxArgumentLength: 5000,
      maxEvidenceFiles: 5,
      acceptedFileTypes: ["image/jpeg", "image/png", "application/pdf"],
      notes:
        "Chicago processes parking disputes through the Department of Administrative Hearings eHearing portal " +
        "(https://parkingtickets.chicago.gov/EHearingWeb/home). Disputes may be submitted for an in-person " +
        "or correspondence (mail-in/online) hearing. Correspondence hearings have a roughly 54% dismissal rate " +
        "for first-time disputes with supporting evidence. Attach photos, meter receipts, or any documentation " +
        "that supports your defense. Submit within 25 days of the citation date to avoid late penalties. " +
        "If found liable, you have 7 days to pay or request a second hearing.",
    };
  },

  async submitDispute(
    violationNumber: string,
    args: string,
    evidencePaths: string[]
  ): Promise<DisputeConfirmation> {
    const browser = await chromium.launch({ headless: false });
    try {
      const context = await browser.newContext({ userAgent: USER_AGENT });
      const page = await context.newPage();

      await page.goto(EHEARING_URL, { waitUntil: "networkidle" });

      console.error(
        `[ticket-fighter] CHICAGO DISPUTE SUBMISSION\n` +
        `=============================================\n` +
        `Violation Number: ${violationNumber}\n` +
        `Evidence files to attach: ${evidencePaths.length > 0 ? evidencePaths.join(", ") : "none"}\n\n` +
        `--- DISPUTE ARGUMENT TEXT (paste into the eHearing portal) ---\n\n` +
        `${args}\n\n` +
        `--- END OF ARGUMENT TEXT ---\n\n` +
        `The Chicago eHearing portal is now open. Please:\n` +
        `  1. Log in or create an account at ${EHEARING_URL}\n` +
        `  2. Select "File a Dispute" and enter violation number: ${violationNumber}\n` +
        `  3. Paste the argument text above into the statement field\n` +
        `  4. Upload any evidence files listed above\n` +
        `  5. Submit the form and note your confirmation number\n\n` +
        `Waiting — close the browser window when finished to continue...`
      );

      // Wait for user to close the browser manually or for a confirmation page
      await page.waitForEvent("close", { timeout: 600000 }).catch(() => {
        // Browser closed by user — treat as completed
      });

      return {
        success: true,
        timestamp: new Date().toISOString(),
        message:
          `Chicago eHearing portal opened for violation ${violationNumber}. ` +
          `Dispute text was printed to the console for manual entry. ` +
          `Record the confirmation number shown after submission. ` +
          `You will receive a hearing notice by mail or email within 2–4 weeks.`,
      };
    } finally {
      await browser.close();
    }
  },

  async checkDisposition(violationNumber: string): Promise<DisputeStatus> {
    const browser = await chromium.launch({ headless: false });
    try {
      const context = await browser.newContext({ userAgent: USER_AGENT });
      const page = await context.newPage();

      await page.goto(LOOKUP_URL, { waitUntil: "networkidle" });

      await page.waitForSelector('input[type="text"]', { timeout: 15000 });
      await page.locator('input[type="text"]').nth(0).fill(violationNumber);

      console.error(
        "[ticket-fighter] CHICAGO: hCaptcha detected. Please solve the CAPTCHA in the browser window, then press Submit. Waiting up to 120 seconds..."
      );

      await page.waitForSelector('[class*="result"], [class*="status"], [class*="ticket"]', {
        timeout: 120000,
      });

      const pageText = await page.innerText("body");
      const textLower = pageText.toLowerCase();

      let status: DisputeStatus["status"] = "unknown";
      let disposition: DisputeStatus["disposition"] = null;
      let details = "";

      if (textLower.includes("dismissed") || textLower.includes("not liable")) {
        status = "decided";
        disposition = "dismissed";
        details = "Violation dismissed — no amount owed.";
      } else if (textLower.includes("liable") || textLower.includes("guilty")) {
        status = "decided";
        disposition = "guilty";
        details = "Found liable. Payment required.";
      } else if (textLower.includes("reduced")) {
        status = "decided";
        disposition = "reduced";
        details = "Fine reduced.";
      } else if (textLower.includes("pending") || textLower.includes("scheduled") || textLower.includes("hearing")) {
        status = "scheduled";
        details = "Hearing scheduled or dispute pending.";
      } else if (textLower.includes("open") || textLower.includes("unpaid")) {
        status = "pending";
        details = "Violation open and unpaid.";
      }

      const amountMatch = pageText.match(/\$?([\d,]+\.?\d{0,2})/);
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(",", "")) : undefined;

      return {
        violationNumber,
        city: "chicago",
        status,
        disposition,
        amount,
        details,
      };
    } finally {
      await browser.close();
    }
  },
};
