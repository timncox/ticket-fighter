export function renderPlates(container: HTMLElement, data: any): void {
  const plates = Array.isArray(data) ? data : data?.plates ?? [];
  const action = data?.action ?? "list";

  let html = `
    <div class="header">
      <div>
        <h1>License Plates</h1>
        <div class="subtitle">${plates.length} plate${plates.length !== 1 ? "s" : ""} saved</div>
      </div>
    </div>
  `;

  if (plates.length === 0) {
    html += `<div class="empty">No plates saved. Add one with manage_plates.</div>`;
  } else {
    for (const p of plates) {
      html += `
        <div class="card card-row">
          <div>
            <div class="mono" style="font-weight:600;">${esc(p.number)}</div>
            <div style="font-size:12px;color:#71717a;">${esc(p.state)} &middot; ${esc(p.city)}</div>
          </div>
          <span class="badge badge-gray">${esc(p.type)}</span>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

function esc(s: string): string {
  const el = document.createElement("span");
  el.textContent = s ?? "";
  return el.innerHTML;
}
