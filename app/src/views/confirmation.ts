export function renderConfirmation(container: HTMLElement, data: any): void {
  const success = data?.success ?? false;
  const ref = data?.referenceNumber ?? "";
  const message = data?.message ?? "";
  const timestamp = data?.timestamp ?? "";

  const bannerClass = success ? "green" : "red";
  const icon = success ? "&#9989;" : "&#10060;";

  let html = `
    <div class="header">
      <h1>Dispute ${success ? "Submitted" : "Failed"}</h1>
    </div>
    <div class="info-banner ${bannerClass}" style="font-size:14px;">
      ${icon} ${esc(message)}
    </div>
  `;

  if (ref) {
    html += `
      <div class="card" style="margin-top:12px;">
        <div class="label">Reference Number</div>
        <div class="value mono" style="font-size:16px;font-weight:600;">${esc(ref)}</div>
      </div>
    `;
  }

  if (timestamp) {
    html += `<div style="font-size:11px;color:#52525b;margin-top:8px;text-align:center;">${esc(timestamp)}</div>`;
  }

  container.innerHTML = html;
}

function esc(s: string): string {
  const el = document.createElement("span");
  el.textContent = s ?? "";
  return el.innerHTML;
}
