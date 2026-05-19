// import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";


const QuoteInput = z.object({
  symbols: z.array(z.string().min(1).max(32)).min(1).max(100),
});

export interface Quote {
  symbol: string;
  inputSymbol: string;
  shortName?: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  currency: string;
  exchange?: string;
  marketState?: string;
}

type CachedQ = { quote: Quote; ts: number };
const QUOTE_CACHE = new Map<string, CachedQ>();
const TTL_MS = 60_000;
const STALE_MS = 30 * 60_000;

function normalize(input: string, raw: any): Quote | null {
  if (!raw) return null;
  const price = Number(raw.regularMarketPrice);
  if (!Number.isFinite(price)) return null;
  const prev = Number(raw.regularMarketPreviousClose ?? price);
  const rawCur = String(raw.currency ?? "USD").toUpperCase();
  // LSE pence → GBP
  const isPence = rawCur === "GBP" && price > 1000;
  const p = isPence ? price / 100 : price;
  const pp = isPence ? prev / 100 : prev;
  const change = p - pp;
  return {
    symbol: String(raw.symbol ?? input).toUpperCase(),
    inputSymbol: input.toUpperCase(),
    shortName: raw.shortName ?? raw.longName,
    regularMarketPrice: p,
    regularMarketPreviousClose: pp,
    regularMarketChange: change,
    regularMarketChangePercent: pp ? (change / pp) * 100 : 0,
    currency: isPence ? "GBP" : rawCur,
    exchange: raw.fullExchangeName ?? raw.exchange,
    marketState: raw.marketState,
  };
}

async function fetchYahooQuotes(symbols: string[]): Promise<Quote[]> {
  if (symbols.length === 0) return [];

  const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
  if (!response.ok) {
    throw new Error(`Quote API error (${response.status})`);
  }

  const json = (await response.json()) as {
    quotes?: any[];
  };
  const rows = json.quotes ?? [];

  const bySymbol = new Map<string, any>();
  for (const row of rows) {
    const symbol = String(row?.symbol ?? "").toUpperCase();
    if (symbol) bySymbol.set(symbol, row);
  }

  const out: Quote[] = [];
  for (const input of symbols) {
    const raw = bySymbol.get(input.toUpperCase());
    const q = normalize(input, raw);
    if (q) out.push(q);
  }
  return out;
}

export async function getQuotesClient(symbols: string[]): Promise<{ quotes: Quote[] }> {
  const parsed = QuoteInput.parse({ symbols });
  const unique = Array.from(new Set(parsed.symbols.map((s) => s.toUpperCase())));
  const now = Date.now();

  const quoteBySymbol = new Map<string, Quote>();
  const staleSymbols: string[] = [];
  const missingSymbols: string[] = [];

  for (const symbol of unique) {
    const cached = QUOTE_CACHE.get(symbol);
    if (!cached) {
      missingSymbols.push(symbol);
      continue;
    }

    const age = now - cached.ts;
    if (age <= TTL_MS) {
      quoteBySymbol.set(symbol, cached.quote);
      continue;
    }

    if (age <= STALE_MS) {
      quoteBySymbol.set(symbol, cached.quote);
      staleSymbols.push(symbol);
      continue;
    }

    missingSymbols.push(symbol);
  }

  const toFetch = Array.from(new Set([...missingSymbols, ...staleSymbols]));
  if (toFetch.length > 0) {
    try {
      const batches: string[][] = [];
      for (let i = 0; i < toFetch.length; i += 50) {
        batches.push(toFetch.slice(i, i + 50));
      }

      for (const batch of batches) {
        const fresh = await fetchYahooQuotes(batch);
        for (const quote of fresh) {
          QUOTE_CACHE.set(quote.inputSymbol.toUpperCase(), { quote, ts: Date.now() });
          quoteBySymbol.set(quote.inputSymbol.toUpperCase(), quote);
          quoteBySymbol.set(quote.symbol.toUpperCase(), quote);
        }
      }
    } catch {
      // Keep stale cache values when live refresh fails.
    }
  }

  return {
    quotes: unique
      .map((symbol) => quoteBySymbol.get(symbol))
      .filter((q): q is Quote => Boolean(q)),
  };
}

// ===== FX rates via Frankfurter (ECB, free, no key) =====
const FxInput = z.object({
  currencies: z.array(z.string().min(3).max(5)).max(20),
});

type FxCache = { rates: Record<string, number>; ts: number };
let FX_CACHE: FxCache | null = null;
const FX_TTL_MS = 10 * 60_000;
const FX_STALE_MS = 24 * 60 * 60_000;

// getFxRates: Implement client-side fetching using a public API as needed for static hosting.

function pickRates(all: Record<string, number>, wanted: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of wanted) if (all[c]) out[c] = all[c];
  if (!out.USD) out.USD = 1;
  return out;
}
