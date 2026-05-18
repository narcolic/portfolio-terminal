import type { Quote } from "@/lib/quotes.functions";

export type PositionRow = {
  id: string;
  ticker: string;
  name: string | null;
  asset_type: string;
  market: string | null;
  currency: string;
  shares: number;
  avg_cost: number;
  notes: string | null;
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

export function enrich(positions: PositionRow[], quotes: Quote[]): Enriched[] {
  const map = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
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
