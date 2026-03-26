import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Plate, CityId } from "./adapters/types.js";

export interface HistoryEntry {
  violationNumber: string;
  city: CityId;
  plate: string;
  dateIssued: string;
  violationCode: string;
  amount: number;
  disputeSubmitted?: string;
  argumentsSummary?: string;
  evidenceAttached: boolean;
  disposition?: "guilty" | "dismissed" | "reduced" | null;
  decisionDate?: string;
  lessonsLearned?: string;
}

export interface Config {
  plates: Plate[];
  gmail_auth_dir: string;
}

const BASE_DIR = path.join(os.homedir(), ".ticket-fighter");
const CONFIG_FILE = path.join(BASE_DIR, "config.json");
const HISTORY_FILE = path.join(BASE_DIR, "history.json");
const DECISIONS_DIR = path.join(BASE_DIR, "decisions");
const AUTH_DIR = path.join(BASE_DIR, "auth", "gmail");

export function ensureDirs(): void {
  for (const dir of [BASE_DIR, DECISIONS_DIR, AUTH_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getAuthDir(): string {
  ensureDirs();
  return AUTH_DIR;
}

export function getDecisionsDir(): string {
  ensureDirs();
  return DECISIONS_DIR;
}

export function loadConfig(): Config {
  ensureDirs();
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaults: Config = { plates: [], gmail_auth_dir: AUTH_DIR };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
}

export function saveConfig(config: Config): void {
  ensureDirs();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function addPlate(plate: Plate): Config {
  const config = loadConfig();
  const exists = config.plates.some(
    (p) => p.number === plate.number && p.city === plate.city
  );
  if (exists) throw new Error(`Plate ${plate.number} already registered for ${plate.city}`);
  config.plates.push(plate);
  saveConfig(config);
  return config;
}

export function removePlate(number: string, city: CityId): Config {
  const config = loadConfig();
  const before = config.plates.length;
  config.plates = config.plates.filter(
    (p) => !(p.number === number && p.city === city)
  );
  if (config.plates.length === before) {
    throw new Error(`Plate ${number} not found for ${city}`);
  }
  saveConfig(config);
  return config;
}

export function loadHistory(): HistoryEntry[] {
  ensureDirs();
  if (!fs.existsSync(HISTORY_FILE)) return [];
  return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
}

export function saveHistory(history: HistoryEntry[]): void {
  ensureDirs();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

export function addHistoryEntry(entry: HistoryEntry): void {
  const history = loadHistory();
  const idx = history.findIndex(
    (h) => h.violationNumber === entry.violationNumber && h.city === entry.city
  );
  if (idx >= 0) {
    history[idx] = { ...history[idx], ...entry };
  } else {
    history.push(entry);
  }
  saveHistory(history);
}

export function getHistoryForCode(
  city: CityId,
  violationCode: string
): HistoryEntry[] {
  return loadHistory().filter(
    (h) => h.city === city && h.violationCode === violationCode
  );
}
