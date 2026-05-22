import type { Quote } from "@/lib/portfolio/quotes.functions";

export type TransactionRow = {
  id: string;
  ticker: string;
  name: string | null;
  asset_type: string;
  market: string | null;
  currency: string;
  shares: number;
  price: number;
  transaction_date: string;
  notes: string | null;
  portfolio_id: string | null;
};

export type PositionRow = {
  id: string; // synthetic composite key
  ticker: string;
  name: string | null;
  asset_type: string;
  market: string | null;
  currency: string;
  shares: number;
  avg_cost: number;
  notes: string | null;
  portfolio_id: string | null;
  tx_count: number;
  first_date: string | null;
  last_date: string | null;
};

export type Enriched = PositionRow & {
  price: number;
  prevClose: number;
  dayChange: number;
  dayChangePct: number;
  marketValue: number;
  costBasis: number;
  unrealized: number;
  unrealizedPct: number;
  quote?: Quote;
};

/**
 * Aggregate raw transactions into positions, grouping by ticker + portfolio + currency.
 * Weighted-average cost = Σ(shares*price) / Σ(shares).
 */
export function aggregateTransactions(txs: TransactionRow[]): PositionRow[] {
  const groups = new Map<string, TransactionRow[]>();
  for (const t of txs) {
    const key = `${t.ticker.toUpperCase()}|${t.portfolio_id ?? ""}|${t.currency}`;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  const out: PositionRow[] = [];
  for (const [key, items] of groups) {
    const totalShares = items.reduce((s, t) => s + Number(t.shares), 0);
    const totalCost = items.reduce((s, t) => s + Number(t.shares) * Number(t.price), 0);
    if (totalShares <= 0) continue;
    const first = items.reduce((a, b) => (a.transaction_date < b.transaction_date ? a : b));
    const last = items.reduce((a, b) => (a.transaction_date > b.transaction_date ? a : b));
    out.push({
      id: key,
      ticker: last.ticker.toUpperCase(),
      name: last.name,
      asset_type: last.asset_type,
      market: last.market,
      currency: last.currency,
      shares: totalShares,
      avg_cost: totalCost / totalShares,
      notes: last.notes,
      portfolio_id: last.portfolio_id,
      tx_count: items.length,
      first_date: first.transaction_date,
      last_date: last.transaction_date,
    });
  }
  return out.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export function enrich(positions: PositionRow[], quotes: Quote[]): Enriched[] {
  const map = new Map<string, Quote>();
  for (const q of quotes) {
    map.set(q.symbol.toUpperCase(), q);
    if (q.inputSymbol) map.set(q.inputSymbol.toUpperCase(), q);
  }
  return positions.map((p) => {
    const q = map.get(p.ticker.toUpperCase());
    const price = q?.regularMarketPrice ?? Number(p.avg_cost);
    const prev = q?.regularMarketPreviousClose ?? price;
    const marketValue = price * Number(p.shares);
    const costBasis = Number(p.avg_cost) * Number(p.shares);
    const unrealized = marketValue - costBasis;
    const dayChange = (price - prev) * Number(p.shares);
    return {
      ...p,
      shares: Number(p.shares),
      avg_cost: Number(p.avg_cost),
      price,
      prevClose: prev,
      dayChange,
      dayChangePct: prev ? ((price - prev) / prev) * 100 : 0,
      marketValue,
      costBasis,
      unrealized,
      unrealizedPct: costBasis ? (unrealized / costBasis) * 100 : 0,
      quote: q,
    };
  });
}

export function fmt(n: number, opts: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...opts,
  }).format(n);
}

export function fmtCurrency(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function fmtPct(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}
