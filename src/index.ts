#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  loadConfig,
  addPlate,
  removePlate,
  addHistoryEntry,
  getHistoryForCode,
} from "./config.js";
import { getAdapter } from "./adapters/registry.js";
import { setupGmailAuth, searchGmailForDecisions } from "./gmail.js";
import { gatherEvidence } from "./evidence.js";
import type { Ticket } from "./adapters/types.js";

const server = new McpServer({
  name: "ticket-fighter",
  version: "1.0.0",
});

server.tool(
  "manage_plates",
  "Add, remove, or list saved license plates for ticket monitoring",
  {
    action: z.enum(["add", "remove", "list"]).describe("Action to perform"),
    number: z.string().optional().describe("Plate number (for add/remove)"),
    state: z.string().optional().describe("Plate state, e.g. NY, IL, FL (for add)"),
    type: z.string().optional().describe("Plate type, e.g. PAS, COM (for add)"),
    city: z.enum(["nyc", "chicago", "orlando"]).optional().describe("City (for add/remove)"),
  },
  async ({ action, number, state, type, city }) => {
    try {
      if (action === "list") {
        const config = loadConfig();
        return { content: [{ type: "text" as const, text: JSON.stringify(config.plates, null, 2) }] };
      }
      if (!number || !city) {
        return { content: [{ type: "text" as const, text: "Error: number and city are required for add/remove" }], isError: true };
      }
      if (action === "add") {
        if (!state || !type) {
          return { content: [{ type: "text" as const, text: "Error: state and type are required for add" }], isError: true };
        }
        const config = addPlate({ number: number.toUpperCase(), state: state.toUpperCase(), type: type.toUpperCase(), city });
        return { content: [{ type: "text" as const, text: `Added ${number.toUpperCase()} (${city}). Plates:\n${JSON.stringify(config.plates, null, 2)}` }] };
      }
      const config = removePlate(number.toUpperCase(), city);
      return { content: [{ type: "text" as const, text: `Removed ${number.toUpperCase()} (${city}). Plates:\n${JSON.stringify(config.plates, null, 2)}` }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "check_tickets",
  "Check for open parking tickets by scraping city violation portals. Checks all saved plates if no plate specified.",
  {
    plate: z.string().optional().describe("Specific plate number to check"),
    city: z.enum(["nyc", "chicago", "orlando"]).optional().describe("Filter to one city"),
  },
  async ({ plate, city }) => {
    try {
      const config = loadConfig();
      let platesToCheck = config.plates;
      if (plate) {
        platesToCheck = platesToCheck.filter((p) => p.number === plate.toUpperCase());
        if (platesToCheck.length === 0) {
          return { content: [{ type: "text" as const, text: `Plate ${plate} not found in saved plates.` }], isError: true };
        }
      }
      if (city) platesToCheck = platesToCheck.filter((p) => p.city === city);
      if (platesToCheck.length === 0) {
        return { content: [{ type: "text" as const, text: "No plates to check. Add plates with manage_plates first." }], isError: true };
      }
      const allTickets: Ticket[] = [];
      const errors: string[] = [];
      for (const p of platesToCheck) {
        try {
          const adapter = getAdapter(p.city);
          const tickets = await adapter.lookupTickets(p.number, p.state, p.type);
          allTickets.push(...tickets);
        } catch (err: any) {
          errors.push(`${p.city}/${p.number}: ${err.message}`);
        }
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ tickets: allTickets, errors: errors.length > 0 ? errors : undefined, checked: platesToCheck.map((p) => `${p.number} (${p.city})`) }, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "analyze_ticket",
  "Gather evidence for a specific violation: ticket details, registration cross-ref, Street View imagery, traffic rule lookup, common defenses, and past dispute history",
  {
    violation_number: z.string().describe("The violation/ticket number"),
    city: z.enum(["nyc", "chicago", "orlando"]).describe("Which city issued the ticket"),
  },
  async ({ violation_number, city }) => {
    try {
      const adapter = getAdapter(city);
      const detail = await adapter.getTicketDetails(violation_number);
      const evidence = await gatherEvidence(detail);
      const pastDisputes = getHistoryForCode(city, detail.violationCode);
      return { content: [{ type: "text" as const, text: JSON.stringify({ ticketDetails: detail, evidence, commonDefenses: evidence.commonDefenses, pastDisputes: pastDisputes.length > 0 ? pastDisputes : "No past disputes for this violation code", formStructure: adapter.getDisputeFormStructure() }, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "generate_dispute",
  "Format dispute arguments into city-specific form structure. Returns a preview — does NOT submit.",
  {
    violation_number: z.string().describe("The violation/ticket number"),
    city: z.enum(["nyc", "chicago", "orlando"]).describe("Which city"),
    arguments: z.string().describe("The dispute text/arguments to submit"),
    evidence_paths: z.array(z.string()).optional().describe("File paths to photos/documents to attach"),
  },
  async ({ violation_number, city, arguments: args, evidence_paths }) => {
    try {
      const adapter = getAdapter(city);
      const form = adapter.getDisputeFormStructure();
      if (args.length > form.maxArgumentLength) {
        return { content: [{ type: "text" as const, text: `Error: Arguments exceed max length (${form.maxArgumentLength} chars)` }], isError: true };
      }
      const evidenceFiles = evidence_paths || [];
      if (evidenceFiles.length > form.maxEvidenceFiles) {
        return { content: [{ type: "text" as const, text: `Error: Too many evidence files. Max ${form.maxEvidenceFiles}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ violation_number, city, arguments: args, evidence_files: evidenceFiles, form_notes: form.notes, status: "PREVIEW — not yet submitted. Call submit_dispute with confirmed=true to submit." }, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "submit_dispute",
  "Submit a previously previewed dispute. Requires confirmed=true as a safety gate.",
  {
    violation_number: z.string().describe("The violation/ticket number"),
    city: z.enum(["nyc", "chicago", "orlando"]).describe("Which city"),
    arguments: z.string().describe("The dispute text to submit"),
    evidence_paths: z.array(z.string()).optional().describe("File paths to evidence"),
    confirmed: z.boolean().describe("Must be true to submit. Safety gate."),
  },
  async ({ violation_number, city, arguments: args, evidence_paths, confirmed }) => {
    if (!confirmed) {
      return { content: [{ type: "text" as const, text: "Submission blocked: confirmed must be true." }], isError: true };
    }
    try {
      const adapter = getAdapter(city);
      const result = await adapter.submitDispute(violation_number, args, evidence_paths || []);
      addHistoryEntry({
        violationNumber: violation_number, city, plate: "", dateIssued: "", violationCode: "", amount: 0,
        disputeSubmitted: new Date().toISOString(), argumentsSummary: args.slice(0, 200), evidenceAttached: (evidence_paths || []).length > 0,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "check_status",
  "Check dispute status via city portal scrape or Gmail search for decision emails",
  {
    violation_number: z.string().optional().describe("Violation number to check on city portal"),
    city: z.enum(["nyc", "chicago", "orlando"]).optional().describe("City (required with violation_number)"),
    gmail_search: z.string().optional().describe("Search Gmail for decision emails"),
  },
  async ({ violation_number, city, gmail_search }) => {
    try {
      if (violation_number && city) {
        const adapter = getAdapter(city);
        const status = await adapter.checkDisposition(violation_number);
        return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
      }
      if (gmail_search) {
        const results = await searchGmailForDecisions(gmail_search);
        return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
      }
      return { content: [{ type: "text" as const, text: "Provide either violation_number+city or gmail_search" }], isError: true };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "setup_gmail",
  "Launch a visible browser for Gmail login. Saves auth state for headless reuse by check_status.",
  {},
  async () => {
    try {
      const result = await setupGmailAuth();
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
