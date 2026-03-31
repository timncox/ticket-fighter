# Ticket Fighter

An MCP server that automates parking ticket detection, evidence gathering, and dispute preparation across multiple US cities. Runs fully in the cloud via the [@ticket_fighter MMP bot](https://tf.mmp.chat) or locally as a stdio MCP server.

## MMP Bot

DM **@ticket_fighter** on [MMP](https://mmp.chat) to use Ticket Fighter through any AI assistant. The bot runs on Railway and handles everything headlessly.

**Landing page:** [tf.mmp.chat](https://tf.mmp.chat)

**Commands:**
- `add ABC1234 NY nyc` — Monitor a plate
- `check` — Scan for tickets now
- `analyze 1234567 nyc` — Evidence & defense strategy
- `dispute 1234567 nyc` — Generate dispute
- `submit 1234567 nyc` — Submit to city portal
- `status 1234567 nyc` — Check outcome
- `gmail` — Connect Gmail for decision tracking
- `help` — Show all commands

Bot source: [`/ticket-fighter-bot`](../ticket-fighter-bot/)

## Supported Cities (24)

### Open Data API (no browser needed)

| City | API | Fallback |
|------|-----|----------|
| **NYC** | NYC Open Data (SODA `nc67-uf89`) | CityPay scraper if data >30 days stale |
| **San Francisco** | SF Open Data (SODA `ab4h-6ztd`) | eTIMS scraper if data >30 days stale |
| **Chicago** | CHIPAY JSON API (ticket # lookups) | Browser scraper for plate searches (hCaptcha) |

### No CAPTCHA (fully automatable)

| City | Platform | Dispute Method |
|------|----------|---------------|
| **Boston** | RMC Pay | Online/mail/video appeal |
| **Miami** | RMC Pay | Via Miami Parking Authority |
| **Charlotte** | RMC Pay | 3-tier appeal |
| **Denver** | RMC Pay | Via portal |
| **Dallas** | RMC Pay | Via portal |
| **Raleigh** | RMC Pay | Via portal |
| **Orlando** | CPC | Notarized appeal form (PDF) |
| **Baltimore** | Custom | Phone/in-person (410-396-3000) |
| **Atlanta** | DS Payments | Duncan appeal portal (14-day deadline) |
| **San Diego** | DS Payments | Duncan appeal portal |
| **Detroit** | DS Payments | Duncan appeal portal |
| **Pittsburgh** | DS Payments | Duncan appeal portal |
| **Milwaukee** | DS Payments | Duncan appeal portal |
| **Sacramento** | DS Payments | Duncan appeal portal |
| **New Orleans** | DS Payments | Duncan appeal portal |

### CAPTCHA (auto-solved via 2Captcha, or user solves in browser)

| City | Platform | CAPTCHA Type | Dispute Method |
|------|----------|-------------|---------------|
| **NYC** | CityPay | reCAPTCHA v2 | HBW online hearing |
| **Chicago** | CHIPAY | hCaptcha | eHearing |
| **Washington DC** | eTIMS | Custom image | DC DMV online |
| **San Francisco** | eTIMS | Custom image | SFMTA citations |
| **Detroit** (eTIMS) | eTIMS | Custom image | Via portal |
| **Cleveland** | eTIMS | Custom image | Via portal |
| **Columbus** | eTIMS | Custom image | Via portal |
| **Oakland** | eTIMS | Custom image | Via portal |
| **Santa Monica** | eTIMS | Custom image | Via portal |

### Platform adapters (add new cities with one line of config)

- **RMC Pay** — 50+ US cities use this platform. Add any with: `createRmcPayAdapter({ cityId, displayName, subdomain })`
- **DS Payments** — 25+ cities. Add with: `createDsPaymentsAdapter({ cityId, displayName, citySlug, appealSlug })`
- **eTIMS** — 10+ major cities. Add with: `createEtimsAdapter({ cityId, displayName, cityPath, subdomain })`

## Cloud Operation

Ticket Fighter runs fully headless in the cloud with these env vars:

| Var | Purpose |
|-----|---------|
| `CAPTCHA_API_KEY` | 2Captcha API key — auto-solves reCAPTCHA v2 (NYC) and hCaptcha (Chicago) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID — enables Gmail API for decision tracking |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL (e.g. `https://tf.mmp.chat/auth/gmail/callback`) |

Without these, the tools fall back to headed browser mode (local use only).

## ChatGPT App

Ticket Fighter includes a widget UI for ChatGPT. All tools render inline results — a dashboard for `check_tickets`, detail views for `analyze_ticket`, dispute previews, and status badges.

To rebuild the widget: `cd app && npm install && npm run build`

## Setup

```bash
npm install
npx playwright install chromium
cd app && npm install && npm run build && cd ..
npm run build
```

### Claude Code (`.mcp.json`)

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

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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
Connect Gmail for decision email monitoring. With Google OAuth configured, returns an authorization URL. Without it, opens a browser for manual login.

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
