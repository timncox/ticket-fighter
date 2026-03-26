# Ticket Fighter

An MCP server that automates parking ticket detection, evidence gathering, and dispute preparation across multiple US cities.

## Supported Cities

| City | Plate Lookup | CAPTCHA | Dispute Method |
|------|-------------|---------|---------------|
| **NYC** | Plate + State + Type | reCAPTCHA (invisible) | HBW online hearing |
| **Chicago** | Plate + State + Last Name | hCaptcha | eHearing (Correspondence/Virtual/In-Person) |
| **Orlando** | Plate + State | None | Notarized appeal form (PDF) |

## Setup

```bash
npm install
npx playwright install chromium
npm run build
```

Add to your Claude Code MCP config (`.mcp.json`):

```json
{
  "mcpServers": {
    "ticket-fighter": {
      "command": "node",
      "args": ["/path/to/ticket-fighter/dist/index.js"]
    }
  }
}
```

## Tools

### `manage_plates`
Add, remove, or list saved license plates.

### `check_tickets`
Scan city portals for open violations on your saved plates.

### `analyze_ticket`
Gather evidence for a specific ticket: details, Street View imagery, registration cross-references, applicable traffic rules, common defenses, and past dispute history.

### `generate_dispute`
Format dispute arguments into city-specific structure. Returns a preview — does not submit.

### `submit_dispute`
Submit a previewed dispute. Requires explicit confirmation.

### `check_status`
Check dispute status via city portal or Gmail search for decision emails.

### `setup_gmail`
Authenticate Gmail for decision email monitoring. Opens a browser for manual login; saves session for headless reuse.

## Adding a New City

1. Create `src/adapters/yourcity.ts` implementing the `CityAdapter` interface
2. Create `src/codes/yourcity-codes.json` with violation codes and defenses
3. Register the adapter in `src/index.ts`
4. Build and test

## License

MIT
