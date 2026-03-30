export function renderDashboard(container: HTMLElement, data: any): void {
  const tickets: any[] = data?.tickets ?? [];
  const errors: string[] = data?.errors ?? [];
  const checked: string[] = data?.checked ?? [];

  const openTickets = tickets.filter((t) => t.status !== "dismissed" && t.status !== "paid");
  const totalAmount = openTickets.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

  let html = `
    <div class="header">
      <div>
        <h1>Ticket Check</h1>
        <div class="subtitle">${checked.join(", ")}</div>
      </div>
      <div style="text-align:right;">
        <div class="amount amount-lg">$${totalAmount.toFixed(2)}</div>
        <div style="font-size:11px;color:#71717a;">${openTickets.length} open</div>
      </div>
    </div>
  `;

  if (tickets.length === 0 && errors.length === 0) {
    html += `<div class="info-banner green">All clear — no open violations found.</div>`;
  }

  for (const t of tickets) {
    const isOpen = t.status !== "dismissed" && t.status !== "paid";
    const badgeClass = isOpen ? "badge-red" : "badge-green";
    html += `
      <div class="card">
        <div class="card-row">
          <div>
            <div class="mono" style="font-weight:500;">${esc(t.violationNumber)}</div>
            <div style="font-size:12px;color:#71717a;">${esc(t.description)}</div>
            <div style="font-size:11px;color:#71717a;">${esc(t.location)} &middot; ${esc(t.dateIssued)}</div>
          </div>
          <div style="text-align:right;">
            <div class="amount">$${(t.amount || 0).toFixed(2)}</div>
            <span class="badge ${badgeClass}">${esc(t.status?.toUpperCase() ?? "OPEN")}</span>
          </div>
        </div>
      </div>
    `;
  }

  if (errors.length > 0) {
    html += `<div class="error">Errors: ${errors.map(esc).join(", ")}</div>`;
  }

  container.innerHTML = html;
}

function esc(s: string): string {
  const el = document.createElement("span");
  el.textContent = s ?? "";
  return el.innerHTML;
}
