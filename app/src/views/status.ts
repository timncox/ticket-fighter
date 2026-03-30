export function renderStatus(container: HTMLElement, data: any): void {
  const violation = data?.violationNumber ?? "";
  const city = data?.city ?? "";
  const status = data?.status ?? "unknown";
  const disposition = data?.disposition ?? null;
  const amount = data?.amount;
  const decisionDate = data?.decisionDate ?? "";
  const details = data?.details ?? "";

  const statusBadge: Record<string, string> = {
    pending: "badge-yellow",
    scheduled: "badge-blue",
    decided: disposition === "dismissed" ? "badge-green" : "badge-red",
    unknown: "badge-gray",
  };

  let html = `
    <div class="header">
      <div>
        <h1>Dispute Status</h1>
        <div class="subtitle">${esc(violation)} &middot; ${esc(city.toUpperCase())}</div>
      </div>
      <span class="badge ${statusBadge[status] ?? "badge-gray"}">${esc(status.toUpperCase())}</span>
    </div>
  `;

  if (disposition) {
    html += `
      <div class="card">
        <div class="label">Disposition</div>
        <div class="value" style="font-size:16px;font-weight:600;">${esc(disposition.toUpperCase())}</div>
      </div>
    `;
  }

  if (amount !== undefined) {
    html += `
      <div class="card" style="margin-top:8px;">
        <div class="label">Amount</div>
        <div class="value amount amount-lg">$${Number(amount).toFixed(2)}</div>
      </div>
    `;
  }

  if (decisionDate) {
    html += `<div style="font-size:12px;color:#71717a;margin-top:8px;">Decision date: ${esc(decisionDate)}</div>`;
  }

  if (details) {
    html += `<div class="card" style="margin-top:8px;"><div class="label">Details</div><div class="value" style="font-size:12px;">${esc(details)}</div></div>`;
  }

  container.innerHTML = html;
}

function esc(s: string): string {
  const el = document.createElement("span");
  el.textContent = s ?? "";
  return el.innerHTML;
}
