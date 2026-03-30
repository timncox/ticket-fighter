export function renderDispute(container: HTMLElement, data: any): void {
  const violation = data?.violation_number ?? "";
  const city = data?.city ?? "";
  const args = data?.arguments ?? "";
  const files: string[] = data?.evidence_files ?? [];
  const notes = data?.form_notes ?? "";

  let html = `
    <div class="header">
      <div>
        <h1>Dispute Preview</h1>
        <div class="subtitle">${esc(violation)} &middot; ${esc(city.toUpperCase())}</div>
      </div>
      <span class="badge badge-yellow">PREVIEW</span>
    </div>

    <div class="card">
      <div class="label">Arguments</div>
      <div class="value" style="white-space:pre-wrap;font-size:13px;margin-top:4px;">${esc(args)}</div>
    </div>
  `;

  if (files.length > 0) {
    html += `
      <div class="card" style="margin-top:8px;">
        <div class="label">Evidence Files (${files.length})</div>
        ${files.map((f: string) => `<div class="value mono" style="font-size:12px;margin-top:2px;">${esc(f)}</div>`).join("")}
      </div>
    `;
  }

  if (notes) {
    html += `<div class="info-banner blue">${esc(notes)}</div>`;
  }

  html += `<div class="info-banner blue" style="margin-top:8px;">Not yet submitted. Call submit_dispute with confirmed=true to submit.</div>`;

  container.innerHTML = html;
}

function esc(s: string): string {
  const el = document.createElement("span");
  el.textContent = s ?? "";
  return el.innerHTML;
}
