import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
// NYC DOF Adapter — Open Data API
// ---------------------------------------------------------------------------

export const nycAdapter: CityAdapter = {
  cityId: "nyc",
  displayName: "New York City",

  async lookupTickets(
    plate: string,
    state: string,
    _type: string
  ): Promise<Ticket[]> {
    const where = encodeURIComponent(
      `plate='${plate.toUpperCase()}' AND state='${state.toUpperCase()}'`
    );
    const results = await queryApi(
      `$where=${where}&$order=issue_date DESC&$limit=50`
    );
    return results.map(violationToTicket);
  },

  async getTicketDetails(violationNumber: string): Promise<TicketDetail> {
    const results = await queryApi(
      `summons_number=${encodeURIComponent(violationNumber)}`
    );

    if (results.length === 0) {
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
        summons_image_url: v.summons_image?.url ?? "",
      },
      photoUrls: v.summons_image?.url ? [v.summons_image.url] : [],
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
      acceptedFileTypes: ["pdf", "jpg", "jpeg", "png"],
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
