import { getAuthDir, getDecisionsDir } from "./config.js";

export async function setupGmailAuth(): Promise<string> {
  throw new Error("Gmail auth not yet implemented — coming in Task 7");
}

export interface GmailSearchResult {
  emails: { subject: string; from: string; date: string; snippet: string }[];
  downloadedPdfs: string[];
}

export async function searchGmailForDecisions(
  query: string
): Promise<GmailSearchResult> {
  throw new Error("Gmail search not yet implemented — coming in Task 7");
}
