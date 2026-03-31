# Ticket Fighter — ChatGPT App Integration

**Date:** 2026-03-30
**Status:** Approved

## Goal

Make ticket-fighter work as a ChatGPT app with an inline widget UI, while keeping the existing stdio transport for local MCP clients.

## Architecture

- **Transport stays stdio** — no public HTTPS endpoint needed for now
- **Add `@modelcontextprotocol/ext-apps`** — same library MMP uses for widget registration
- **Single-file widget** — built with Vite + `vite-plugin-singlefile`, embedded as an MCP resource
- **Widget communicates via MCP Apps bridge** — receives `structuredContent` from tool results via `postMessage`

## Widget Views

One HTML file with a view router that renders based on the tool name in the incoming tool result.

| Tool | View | Data |
|------|------|------|
| `manage_plates` | Plate list with add/remove | plates array |
| `check_tickets` | Dashboard — plates with ticket counts, amounts, status badges | tickets + plates |
| `analyze_ticket` | Detail — violation info, evidence, defenses, form structure | ticketDetails + evidence |
| `generate_dispute` | Dispute preview with arguments and attached evidence | preview data |
| `submit_dispute` | Confirmation card (success/failure) | result |
| `check_status` | Status badge with disposition details | status data |
| `setup_gmail` | Simple text result (no special view needed) | text |

### Visual Design

- Dark theme (#09090b background, #e4e4e7 text, #27272a borders)
- Status badges: red for open/unpaid, green for clear/dismissed, blue for pending/in-progress
- Card-based layout with grid for structured data (violation details, evidence)
- Monospace for ticket numbers, amounts, dates

## Server Changes (`src/index.ts`)

### 1. Migrate `server.tool()` to `server.registerTool()`

All 7 tools migrate to use `registerTool` with `_meta.ui.resourceUri` pointing to the widget template.

### 2. Add Tool Annotations

| Tool | readOnlyHint | destructiveHint | openWorldHint |
|------|-------------|-----------------|---------------|
| `manage_plates` | false | false | false |
| `check_tickets` | true | false | true |
| `analyze_ticket` | true | false | true |
| `generate_dispute` | true | false | false |
| `submit_dispute` | false | true | true |
| `check_status` | true | false | true |
| `setup_gmail` | false | false | true |

### 3. Return `structuredContent` Alongside `content`

Every tool response returns both:
- `structuredContent` — typed JSON for the widget to render
- `content` — text narration for the model

Example for `check_tickets`:
```typescript
return {
  structuredContent: {
    tool: "check_tickets",
    tickets: allTickets,
    errors: errors.length > 0 ? errors : undefined,
    checked: platesToCheck.map(p => `${p.number} (${p.city})`),
  },
  content: [{ type: "text", text: JSON.stringify({ tickets: allTickets, ... }, null, 2) }],
};
```

### 4. Register Widget Resource

Via `registerAppResource` from `@modelcontextprotocol/ext-apps/server` with:
- `_meta.ui.domain` — `https://ticket-fighter.local` (placeholder, will update when deployed)
- `_meta.ui.csp` — `connectDomains: []` (widget doesn't fetch externally)

### 5. Add `resources` Capability

Add `resources: {}` to the McpServer capabilities.

## New Files

### `app/` — Widget Vite project

```
app/
  package.json          # vite, vite-plugin-singlefile, typescript
  tsconfig.json
  vite.config.ts        # singlefile plugin
  index.html            # entry point, mounts #app
  src/
    widget.ts           # MCP App init, view router, tool result handler
    styles.css          # dark theme
    views/
      dashboard.ts      # check_tickets view
      detail.ts         # analyze_ticket view
      dispute.ts        # generate_dispute preview
      confirmation.ts   # submit_dispute result
      plates.ts         # manage_plates list
      status.ts         # check_status view
  dist/
    widget.html         # built artifact (gitignored, copied by build)
```

### Build

- `cd app && npm run build` produces `dist/widget.html`
- Server reads `../app/dist/widget.html` at startup via `readFileSync`

## What Stays the Same

- All existing tool logic, adapters, config, evidence gathering, gmail auth
- Stdio transport (local execution)
- CLI usage via `node dist/index.js`
- The `src/codes/` JSON files and copy step in build
- All 24 city adapters

## Dependencies Added

- `@modelcontextprotocol/ext-apps` (server — for `registerAppResource`/`registerAppTool`)
- `vite` + `vite-plugin-singlefile` + `typescript` (app — dev dependencies)
