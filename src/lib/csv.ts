// Minimal RFC-4180-ish CSV parser (handles quoted fields, commas, newlines, doubled quotes).
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const ALIASES: Record<string, string> = {
  symbol: "ticker", code: "ticker", isin: "ticker", security: "ticker",
  qty: "shares", quantity: "shares", units: "shares", position: "shares",
  cost: "avg_cost", "avg cost": "avg_cost", "average cost": "avg_cost",
  "cost basis": "avg_cost", "buy price": "avg_cost", price: "avg_cost",
  type: "asset_type", category: "asset_type", "asset type": "asset_type",
  exchange: "market", venue: "market",
  ccy: "currency",
  description: "name", label: "name",
  portfolio: "portfolio", broker: "portfolio", account: "portfolio", platform: "portfolio",
};

export type CsvPositionRow = {
  ticker: string;
  name?: string;
  asset_type?: string;
  market?: string;
  currency?: string;
  shares: number;
  avg_cost: number;
  notes?: string;
  portfolio?: string;
};

export function mapCsvRows(rows: string[][]): {
  rows: CsvPositionRow[];
  errors: string[];
} {
  if (rows.length < 2) return { rows: [], errors: ["CSV is empty or missing header row"] };
  const header = rows[0].map((h) => {
    const k = h.trim().toLowerCase();
    return ALIASES[k] ?? k.replace(/\s+/g, "_");
  });
  const idx = (k: string) => header.indexOf(k);
  const required = ["ticker", "shares"];
  const missing = required.filter((k) => idx(k) === -1);
  if (missing.length) return { rows: [], errors: [`Missing required column(s): ${missing.join(", ")}`] };

  const errors: string[] = [];
  const out: CsvPositionRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const get = (k: string) => {
      const i = idx(k);
      return i === -1 ? "" : (cells[i] ?? "").trim();
    };
    const ticker = get("ticker").toUpperCase();
    const sharesN = Number(get("shares").replace(/,/g, ""));
    const avg = Number((get("avg_cost") || "0").replace(/,/g, "")) || 0;
    if (!ticker) { errors.push(`Row ${r + 1}: missing ticker`); continue; }
    if (!Number.isFinite(sharesN) || sharesN < 0) {
      errors.push(`Row ${r + 1}: invalid shares "${get("shares")}"`); continue;
    }
    out.push({
      ticker,
      name: get("name") || undefined,
      asset_type: (get("asset_type") || "stock").toLowerCase(),
      market: get("market") || undefined,
      currency: (get("currency") || "USD").toUpperCase(),
      shares: sharesN,
      avg_cost: avg,
      notes: get("notes") || undefined,
      portfolio: get("portfolio") || undefined,
    });
  }
  return { rows: out, errors };
}
