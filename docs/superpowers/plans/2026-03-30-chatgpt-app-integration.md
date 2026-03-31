# Ticket Fighter ChatGPT App Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ChatGPT app support to ticket-fighter with an inline widget UI, tool annotations, and structured content responses.

**Architecture:** Widget built as a single-file HTML app (Vite + vite-plugin-singlefile), registered as an MCP resource via `@modelcontextprotocol/ext-apps`. Server tools migrated to `registerTool` with `_meta.ui.resourceUri` and annotations. Each tool returns both `structuredContent` (for the widget) and `content` (for the model).

**Tech Stack:** TypeScript, Vite, `@modelcontextprotocol/ext-apps`, `vite-plugin-singlefile`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `app/package.json` | Widget build dependencies |
| `app/tsconfig.json` | Widget TypeScript config |
| `app/vite.config.ts` | Vite singlefile build |
| `app/index.html` | Widget HTML entry |
| `app/src/widget.ts` | MCP App init, view router, tool result listener |
| `app/src/styles.css` | Dark theme styles |
| `app/src/views/dashboard.ts` | `check_tickets` view |
| `app/src/views/detail.ts` | `analyze_ticket` view |
| `app/src/views/dispute.ts` | `generate_dispute` preview |
| `app/src/views/confirmation.ts` | `submit_dispute` result |
| `app/src/views/plates.ts` | `manage_plates` list |
| `app/src/views/status.ts` | `check_status` view |
| `app/src/views/fallback.ts` | Default/unknown tool view |

### Modified Files

| File | Change |
|------|--------|
| `src/index.ts` | Migrate all 7 `server.tool()` to `server.registerTool()`, add annotations, add `structuredContent`, register widget resource, add `resources` capability |
| `package.json` | Add `@modelcontextprotocol/ext-apps` dependency |
| `tsconfig.json` | Already on `NodeNext` (no change needed) |

---

### Task 1: Scaffold the Widget App

**Files:**
- Create: `app/package.json`
- Create: `app/tsconfig.json`
- Create: `app/vite.config.ts`
- Create: `app/index.html`

- [ ] **Step 1: Create `app/package.json`**

```json
{
  "name": "ticket-fighter-widget",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "vite build",
    "dev": "vite"
  },
  "dependencies": {
    "@modelcontextprotocol/ext-apps": "^1.3.1"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vite-plugin-singlefile": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `app/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "dist",
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `app/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist",
    emptyDirOnBuild: true,
  },
});
```

- [ ] **Step 4: Create `app/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket Fighter</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/widget.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Install dependencies**

Run: `cd /Users/timcox/tim-os/ticket-fighter/app && npm install`
Expected: `node_modules` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add app/package.json app/tsconfig.json app/vite.config.ts app/index.html app/package-lock.json
git commit -m "feat: scaffold ticket-fighter widget app"
```

---

### Task 2: Build the Widget Styles

**Files:**
- Create: `app/src/styles.css`

- [ ] **Step 1: Create `app/src/styles.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #09090b;
  color: #e4e4e7;
  -webkit-font-smoothing: antialiased;
  padding: 16px;
  font-size: 14px;
  line-height: 1.5;
}

a { color: #7dd3fc; text-decoration: none; }
a:hover { text-decoration: underline; }

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.header h1 {
  font-size: 16px;
  font-weight: 600;
}

.header .subtitle {
  font-size: 12px;
  color: #71717a;
}

.card {
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

.card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #71717a;
  margin-bottom: 2px;
}

.value {
  font-size: 13px;
}

.mono {
  font-family: ui-monospace, 'SF Mono', monospace;
}

.badge {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 10px;
  display: inline-block;
}

.badge-red { background: #7f1d1d; color: #fca5a5; }
.badge-green { background: #14532d; color: #86efac; }
.badge-blue { background: #172554; color: #93c5fd; }
.badge-yellow { background: #422006; color: #fde047; }
.badge-gray { background: #27272a; color: #a1a1aa; }

.amount {
  font-family: ui-monospace, monospace;
  font-weight: 600;
}

.amount-lg {
  font-size: 20px;
}

.defense-list {
  list-style: none;
  padding: 0;
}

.defense-list li {
  padding: 6px 0;
  border-bottom: 1px solid #27272a;
  font-size: 13px;
  color: #7dd3fc;
}

.defense-list li:last-child {
  border-bottom: none;
}

.info-banner {
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  margin-top: 12px;
}

.info-banner.blue { background: #172554; border: 1px solid #1e3a5f; color: #93c5fd; }
.info-banner.green { background: #14532d; border: 1px solid #166534; color: #86efac; }
.info-banner.red { background: #7f1d1d; border: 1px solid #991b1b; color: #fca5a5; }

.empty {
  text-align: center;
  color: #52525b;
  padding: 32px 16px;
  font-size: 13px;
}

.error {
  color: #ef4444;
  font-size: 13px;
  margin-top: 8px;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/styles.css
git commit -m "feat: add widget dark theme styles"
```

---

### Task 3: Build Widget View Renderers

**Files:**
- Create: `app/src/views/dashboard.ts`
- Create: `app/src/views/detail.ts`
- Create: `app/src/views/dispute.ts`
- Create: `app/src/views/confirmation.ts`
- Create: `app/src/views/plates.ts`
- Create: `app/src/views/status.ts`
- Create: `app/src/views/fallback.ts`

- [ ] **Step 1: Create `app/src/views/plates.ts`**

This view renders the result of `manage_plates`.

```typescript
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
```

- [ ] **Step 2: Create `app/src/views/dashboard.ts`**

This view renders the result of `check_tickets`.

```typescript
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
```

- [ ] **Step 3: Create `app/src/views/detail.ts`**

This view renders the result of `analyze_ticket`.

```typescript
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

  // Vehicle info if available
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

  // Defenses
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

  // Evidence notes
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

  // Form info
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
```

- [ ] **Step 4: Create `app/src/views/dispute.ts`**

This view renders the result of `generate_dispute`.

```typescript
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
```

- [ ] **Step 5: Create `app/src/views/confirmation.ts`**

This view renders the result of `submit_dispute`.

```typescript
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
    html += `
      <div style="font-size:11px;color:#52525b;margin-top:8px;text-align:center;">${esc(timestamp)}</div>
    `;
  }

  container.innerHTML = html;
}

function esc(s: string): string {
  const el = document.createElement("span");
  el.textContent = s ?? "";
  return el.innerHTML;
}
```

- [ ] **Step 6: Create `app/src/views/status.ts`**

This view renders the result of `check_status`.

```typescript
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
```

- [ ] **Step 7: Create `app/src/views/fallback.ts`**

Renders for `setup_gmail` or any unrecognized tool.

```typescript
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
```

- [ ] **Step 8: Commit**

```bash
git add app/src/views/
git commit -m "feat: add widget view renderers for all tools"
```

---

### Task 4: Build the Widget Entry Point

**Files:**
- Create: `app/src/widget.ts`

- [ ] **Step 1: Create `app/src/widget.ts`**

```typescript
import { App } from "@modelcontextprotocol/ext-apps";
import "./styles.css";
import { renderPlates } from "./views/plates.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderDetail } from "./views/detail.js";
import { renderDispute } from "./views/dispute.js";
import { renderConfirmation } from "./views/confirmation.js";
import { renderStatus } from "./views/status.js";
import { renderFallback } from "./views/fallback.js";

const app = new App({ name: "Ticket Fighter", version: "1.0.0", autoResize: true });

function getContainer(): HTMLElement {
  const el = document.getElementById("app");
  if (!el) throw new Error("Missing #app container");
  return el;
}

type ViewRouter = Record<string, (container: HTMLElement, data: any) => void>;

const views: ViewRouter = {
  manage_plates: renderPlates,
  check_tickets: renderDashboard,
  analyze_ticket: renderDetail,
  generate_dispute: renderDispute,
  submit_dispute: renderConfirmation,
  check_status: renderStatus,
  setup_gmail: renderFallback,
};

function renderToolResult(toolResult: any): void {
  const container = getContainer();
  const data = toolResult?.structuredContent ?? toolResult;
  const toolName = data?.tool as string | undefined;

  const renderer = (toolName && views[toolName]) || renderFallback;
  renderer(container, data);
}

async function init(): Promise<void> {
  try {
    await app.connect();
  } catch {
    // Not in an MCP App host — render fallback
  }

  app.ontoolresult = (result) => {
    renderToolResult(result);
  };

  // Show waiting state
  getContainer().innerHTML = `
    <div class="empty">Waiting for tool results...</div>
  `;
}

init();
```

- [ ] **Step 2: Build the widget**

Run: `cd /Users/timcox/tim-os/ticket-fighter/app && npm run build`
Expected: `dist/widget.html` created with all JS/CSS inlined.

- [ ] **Step 3: Verify the build output exists**

Run: `ls -la /Users/timcox/tim-os/ticket-fighter/app/dist/widget.html`
Expected: File exists, size > 1KB.

- [ ] **Step 4: Commit**

```bash
git add app/src/widget.ts
git commit -m "feat: add widget entry point with view router"
```

---

### Task 5: Add `@modelcontextprotocol/ext-apps` to Server

**Files:**
- Modify: `package.json` (server root)

- [ ] **Step 1: Install the dependency**

Run: `cd /Users/timcox/tim-os/ticket-fighter && npm install @modelcontextprotocol/ext-apps`
Expected: Package added to `dependencies` in `package.json`.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @modelcontextprotocol/ext-apps dependency"
```

---

### Task 6: Migrate Server Tools and Register Widget

**Files:**
- Modify: `src/index.ts`

This is the largest task. All 7 `server.tool()` calls get replaced with `server.registerTool()`, adding annotations, `_meta`, and `structuredContent` responses. The widget resource is registered at the end.

- [ ] **Step 1: Add imports and constants at the top of `src/index.ts`**

Add after the existing imports (after line 15):

```typescript
import { readFileSync } from "node:fs";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
```

Add after all `registerAdapter()` calls (after line 51), before the `const server` line:

```typescript
const WIDGET_URI = "ui://ticket-fighter/widget.html";
let widgetHtml: string;
try {
  widgetHtml = readFileSync(new URL("../app/dist/widget.html", import.meta.url), "utf-8");
} catch {
  widgetHtml = "<div>Widget not built. Run: cd app && npm run build</div>";
}
```

- [ ] **Step 2: Update McpServer constructor to include resources capability**

Replace the existing constructor (lines 53-56):

```typescript
const server = new McpServer({
  name: "ticket-fighter",
  version: "1.0.0",
}, { capabilities: { tools: {}, resources: {} } });
```

- [ ] **Step 3: Migrate `manage_plates` tool (lines 58-90)**

Replace the entire `server.tool("manage_plates", ...)` block with:

```typescript
server.registerTool(
  "manage_plates",
  {
    description: "Add, remove, or list saved license plates for ticket monitoring",
    inputSchema: {
      action: z.enum(["add", "remove", "list"]).describe("Action to perform"),
      number: z.string().optional().describe("Plate number (for add/remove)"),
      state: z.string().optional().describe("Plate state, e.g. NY, IL, FL (for add)"),
      type: z.string().optional().describe("Plate type, e.g. PAS, COM (for add)"),
      city: z.enum(["nyc", "chicago", "orlando"]).optional().describe("City (for add/remove)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: WIDGET_URI } },
  },
  async ({ action, number, state, type, city }) => {
    try {
      if (action === "list") {
        const config = loadConfig();
        return {
          structuredContent: { tool: "manage_plates", action, plates: config.plates },
          content: [{ type: "text" as const, text: JSON.stringify(config.plates, null, 2) }],
        };
      }
      if (!number || !city) {
        return { content: [{ type: "text" as const, text: "Error: number and city are required for add/remove" }], isError: true };
      }
      if (action === "add") {
        if (!state || !type) {
          return { content: [{ type: "text" as const, text: "Error: state and type are required for add" }], isError: true };
        }
        const config = addPlate({ number: number.toUpperCase(), state: state.toUpperCase(), type: type.toUpperCase(), city });
        return {
          structuredContent: { tool: "manage_plates", action, plates: config.plates },
          content: [{ type: "text" as const, text: `Added ${number.toUpperCase()} (${city}). Plates:\n${JSON.stringify(config.plates, null, 2)}` }],
        };
      }
      const config = removePlate(number.toUpperCase(), city);
      return {
        structuredContent: { tool: "manage_plates", action, plates: config.plates },
        content: [{ type: "text" as const, text: `Removed ${number.toUpperCase()} (${city}). Plates:\n${JSON.stringify(config.plates, null, 2)}` }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);
```

- [ ] **Step 4: Migrate `check_tickets` tool (lines 92-129)**

Replace with:

```typescript
server.registerTool(
  "check_tickets",
  {
    description: "Check for open parking tickets by scraping city violation portals. Checks all saved plates if no plate specified.",
    inputSchema: {
      plate: z.string().optional().describe("Specific plate number to check"),
      city: z.enum(["nyc", "chicago", "orlando"]).optional().describe("Filter to one city"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: WIDGET_URI } },
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
      const result = { tickets: allTickets, errors: errors.length > 0 ? errors : undefined, checked: platesToCheck.map((p) => `${p.number} (${p.city})`) };
      return {
        structuredContent: { tool: "check_tickets", ...result },
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);
```

- [ ] **Step 5: Migrate `analyze_ticket` tool (lines 131-149)**

Replace with:

```typescript
server.registerTool(
  "analyze_ticket",
  {
    description: "Gather evidence for a specific violation: ticket details, registration cross-ref, Street View imagery, traffic rule lookup, common defenses, and past dispute history",
    inputSchema: {
      violation_number: z.string().describe("The violation/ticket number"),
      city: z.enum(["nyc", "chicago", "orlando"]).describe("Which city issued the ticket"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: WIDGET_URI } },
  },
  async ({ violation_number, city }) => {
    try {
      const adapter = getAdapter(city);
      const detail = await adapter.getTicketDetails(violation_number);
      const evidence = await gatherEvidence(detail);
      const pastDisputes = getHistoryForCode(city, detail.violationCode);
      const result = { ticketDetails: detail, evidence, commonDefenses: evidence.commonDefenses, pastDisputes: pastDisputes.length > 0 ? pastDisputes : "No past disputes for this violation code", formStructure: adapter.getDisputeFormStructure() };
      return {
        structuredContent: { tool: "analyze_ticket", ...result },
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);
```

- [ ] **Step 6: Migrate `generate_dispute` tool (lines 151-176)**

Replace with:

```typescript
server.registerTool(
  "generate_dispute",
  {
    description: "Format dispute arguments into city-specific form structure. Returns a preview — does NOT submit.",
    inputSchema: {
      violation_number: z.string().describe("The violation/ticket number"),
      city: z.enum(["nyc", "chicago", "orlando"]).describe("Which city"),
      arguments: z.string().describe("The dispute text/arguments to submit"),
      evidence_paths: z.array(z.string()).optional().describe("File paths to photos/documents to attach"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { ui: { resourceUri: WIDGET_URI } },
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
      const result = { violation_number, city, arguments: args, evidence_files: evidenceFiles, form_notes: form.notes, status: "PREVIEW — not yet submitted. Call submit_dispute with confirmed=true to submit." };
      return {
        structuredContent: { tool: "generate_dispute", ...result },
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);
```

- [ ] **Step 7: Migrate `submit_dispute` tool (lines 178-204)**

Replace with:

```typescript
server.registerTool(
  "submit_dispute",
  {
    description: "Submit a previously previewed dispute. Requires confirmed=true as a safety gate.",
    inputSchema: {
      violation_number: z.string().describe("The violation/ticket number"),
      city: z.enum(["nyc", "chicago", "orlando"]).describe("Which city"),
      arguments: z.string().describe("The dispute text to submit"),
      evidence_paths: z.array(z.string()).optional().describe("File paths to evidence"),
      confirmed: z.boolean().describe("Must be true to submit. Safety gate."),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    _meta: { ui: { resourceUri: WIDGET_URI } },
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
      return {
        structuredContent: { tool: "submit_dispute", ...result },
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);
```

- [ ] **Step 8: Migrate `check_status` tool (lines 206-230)**

Replace with:

```typescript
server.registerTool(
  "check_status",
  {
    description: "Check dispute status via city portal scrape or Gmail search for decision emails",
    inputSchema: {
      violation_number: z.string().optional().describe("Violation number to check on city portal"),
      city: z.enum(["nyc", "chicago", "orlando"]).optional().describe("City (required with violation_number)"),
      gmail_search: z.string().optional().describe("Search Gmail for decision emails"),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: WIDGET_URI } },
  },
  async ({ violation_number, city, gmail_search }) => {
    try {
      if (violation_number && city) {
        const adapter = getAdapter(city);
        const status = await adapter.checkDisposition(violation_number);
        return {
          structuredContent: { tool: "check_status", ...status },
          content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }],
        };
      }
      if (gmail_search) {
        const results = await searchGmailForDecisions(gmail_search);
        return {
          structuredContent: { tool: "check_status", gmailResults: results },
          content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        };
      }
      return { content: [{ type: "text" as const, text: "Provide either violation_number+city or gmail_search" }], isError: true };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);
```

- [ ] **Step 9: Migrate `setup_gmail` tool (lines 232-244)**

Replace with:

```typescript
server.registerTool(
  "setup_gmail",
  {
    description: "Launch a visible browser for Gmail login. Saves auth state for headless reuse by check_status.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: WIDGET_URI } },
  },
  async () => {
    try {
      const result = await setupGmailAuth();
      return {
        structuredContent: { tool: "setup_gmail", message: result },
        content: [{ type: "text" as const, text: result }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);
```

- [ ] **Step 10: Register widget resource and open tool**

Add before the `async function main()` block:

```typescript
// Register widget resource for ChatGPT app
registerAppResource(
  server,
  "Ticket Fighter",
  WIDGET_URI,
  {
    description: "Ticket Fighter — parking ticket dashboard and dispute assistant",
    _meta: {
      ui: {
        domain: "https://ticket-fighter.local",
        csp: {
          connectDomains: [],
          resourceDomains: [],
        },
      },
    },
  },
  async () => ({
    contents: [{
      uri: WIDGET_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: widgetHtml,
      _meta: {
        ui: {
          domain: "https://ticket-fighter.local",
          csp: {
            connectDomains: [],
            resourceDomains: [],
          },
        },
      },
    }],
  }),
);

// Open widget tool
registerAppTool(
  server,
  "open_dashboard",
  {
    description: "Open the Ticket Fighter dashboard in the MCP App UI.",
    _meta: { ui: { resourceUri: WIDGET_URI } },
  },
  async () => {
    const config = loadConfig();
    return {
      structuredContent: { tool: "manage_plates", action: "list", plates: config.plates },
      content: [{ type: "text" as const, text: `${config.plates.length} plates saved.` }],
    };
  },
);
```

- [ ] **Step 11: Build and verify**

Run: `cd /Users/timcox/tim-os/ticket-fighter && npx tsc --noEmit`
Expected: No type errors.

Run: `cd /Users/timcox/tim-os/ticket-fighter && npm run build`
Expected: Clean build, `dist/` populated.

- [ ] **Step 12: Commit**

```bash
git add src/index.ts
git commit -m "feat: migrate all tools to registerTool with ChatGPT app support"
```

---

### Task 7: Build, Test, and Final Commit

**Files:**
- Modify: `package.json` (add app build to scripts if desired)

- [ ] **Step 1: Build the widget**

Run: `cd /Users/timcox/tim-os/ticket-fighter/app && npm run build`
Expected: `dist/widget.html` created.

- [ ] **Step 2: Build the server**

Run: `cd /Users/timcox/tim-os/ticket-fighter && npm run build`
Expected: Clean build.

- [ ] **Step 3: Test the server starts**

Run: `node dist/index.js &; PID=$!; sleep 2; kill $PID 2>/dev/null; wait $PID 2>/dev/null; echo "exit: $?"`
Expected: Exit code 143 (killed by signal = started successfully).

- [ ] **Step 4: Add `.gitignore` entries**

Add to `.gitignore` (create if it doesn't exist):

```
node_modules/
app/node_modules/
app/dist/
.superpowers/
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete ChatGPT app integration with widget UI"
```
