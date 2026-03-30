export function renderFallback(container: HTMLElement, data: any): void {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  container.innerHTML = `
    <div class="card">
      <pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px;color:#a1a1aa;">${esc(text)}</pre>
    </div>
  `;
}

function esc(s: string): string {
  const el = document.createElement("span");
  el.textContent = s ?? "";
  return el.innerHTML;
}
