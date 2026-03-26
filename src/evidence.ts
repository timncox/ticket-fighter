import type { TicketDetail } from "./adapters/types.js";

export interface EvidencePackage {
  streetViewImages: string[];
  registrationDiscrepancies: string[];
  trafficRuleText: string;
  commonDefenses: string[];
  locationNotes: string;
}

export async function gatherEvidence(
  ticket: TicketDetail
): Promise<EvidencePackage> {
  throw new Error("Evidence gathering not yet implemented — coming in Task 8");
}
