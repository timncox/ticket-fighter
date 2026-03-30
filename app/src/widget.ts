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

  getContainer().innerHTML = `<div class="empty">Waiting for tool results...</div>`;
}

init();
