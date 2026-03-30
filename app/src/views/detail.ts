export function renderDetail(container: HTMLElement, data: any): void {
  const ticket = data?.ticketDetails ?? {};
  const evidence = data?.evidence ?? {};
  const defenses: string[] = evidence?.commonDefenses ?? data?.commonDefenses ?? [];
  const form = data?.formStructure ?? {};

  let html = `
    <div class="header">
      <div>
        <h1>Violation ${esc(ticket.violationNumber ?? "")}</h1>
        <div class="subtitle">${esc(ticket.city?.toUpperCase() ?? "")} &middot; ${esc(ticket.dateIssued ?? "")} &middot; $${(ticket.amount || 0).toFixed(2)}</div>
      </div>
      <span class="badge ${ticket.status === "dismissed" ? "badge-green" : "badge-red"}">${esc(ticket.status?.toUpperCase() ?? "OPEN")}</span>
    </div>

    <div class="grid">
      <div class="card">
        <div class="label">Violation</div>
        <div class="value">${esc(ticket.description ?? ticket.violationCode ?? "")}</div>
      </div>
      <div class="card">
        <div class="label">Location</div>
        <div class="value">${esc(ticket.location ?? "")}</div>
      </div>
    </div>
  `;

  if (ticket.vehicleMake || ticket.vehicleColor) {
    html += `
      <div class="grid" style="margin-top:8px;">
        <div class="card">
          <div class="label">Vehicle</div>
          <div class="value">${esc([ticket.vehicleColor, ticket.vehicleMake, ticket.vehicleModel].filter(Boolean).join(" "))}</div>
        </div>
        ${ticket.meterNumber ? `<div class="card"><div class="label">Meter</div><div class="value mono">${esc(ticket.meterNumber)}</div></div>` : ""}
      </div>
    `;
  }

  if (defenses.length > 0) {
    html += `
      <div class="card" style="margin-top:8px;">
        <div class="label">Common Defenses</div>
        <ul class="defense-list">
          ${defenses.map((d: string) => `<li>${esc(d)}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  const notes: string[] = [];
  if (evidence.locationNotes) notes.push(evidence.locationNotes);
  if (evidence.trafficRuleText) notes.push(evidence.trafficRuleText);
  if (evidence.ticketErrors?.length > 0) notes.push("Ticket errors: " + evidence.ticketErrors.join(", "));
  if (evidence.registrationDiscrepancies?.length > 0) notes.push("Registration issues: " + evidence.registrationDiscrepancies.join(", "));

  if (notes.length > 0) {
    html += `
      <div class="card" style="margin-top:8px;">
        <div class="label">Evidence Notes</div>
        ${notes.map((n) => `<div class="value" style="margin-top:4px;font-size:12px;color:#a1a1aa;">${esc(n)}</div>`).join("")}
      </div>
    `;
  }

  if (form.notes) {
    html += `<div class="info-banner blue">Dispute: ${esc(form.notes)}</div>`;
  }

  container.innerHTML = html;
}

function esc(s: string): string {
  const el = document.createElement("span");
  el.textContent = s ?? "";
  return el.innerHTML;
}
