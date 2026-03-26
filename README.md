# Ticket Fighter

An MCP server that automates parking ticket detection, evidence gathering, and dispute preparation across multiple US cities.

## Supported Cities (12)

| City | Plate Lookup | CAPTCHA | Dispute Method | Platform |
|------|-------------|---------|---------------|----------|
| **NYC** | Plate + State + Type | reCAPTCHA (invisible) | HBW online hearing | CityPay |
| **Chicago** | Plate + State + Last Name | hCaptcha | eHearing (Correspondence/Virtual/In-Person) | CHIPAY |
| **Orlando** | Plate + State | None | Notarized appeal form (PDF) | CPC |
| **Boston** | Plate + State | None | Online/mail/video appeal | RMC Pay |
| **Miami** | Plate + State | None | Via Miami Parking Authority | RMC Pay |
| **Charlotte** | Plate + State | None | 3-tier appeal (Admin/Hearing/Court) | RMC Pay |
| **Denver** | Plate + State | None | Via RMC Pay portal | RMC Pay |
| **Dallas** | Plate + State | None | Via RMC Pay portal | RMC Pay |
| **Raleigh** | Plate + State | None | Via RMC Pay portal | RMC Pay |
| **Baltimore** | Plate only | None | Phone/in-person (410-396-3000) | Custom |
| **Washington DC** | Plate + State | Custom image CAPTCHA | DC DMV online | eTIMS |
| **Atlanta** | Plate + State | None | Duncan appeal portal (14-day deadline) | DS Payments |

RMC Pay cities share a generic adapter — adding a new RMC Pay city is one line of config.

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

**If the city uses RMC Pay** (check if `{cityname}.rmcpay.com` loads their portal):
1. Add one line to `src/adapters/rmcpay-cities.ts`: `export const myAdapter = createRmcPayAdapter({ cityId: "mycity", displayName: "My City", subdomain: "mycitysubdomain" });`
2. Register in `src/index.ts`
3. Build and test

**For other platforms:**
1. Create `src/adapters/yourcity.ts` implementing the `CityAdapter` interface
2. Create `src/codes/yourcity-codes.json` with violation codes and defenses
3. Register the adapter in `src/index.ts`
4. Build and test

## License

MIT
