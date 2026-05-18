import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const QuoteInput = z.object({
  symbols: z.array(z.string().min(1).max(20)).min(1).max(100),
});

export interface Quote {
  symbol: string;
  shortName?: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  currency: string;
  exchange?: string;
  marketState?: string;
}

// Simple in-memory cache (per server instance). Keyed by symbol.
type Cached = { quote: Quote; ts: number };
const CACHE = new Map<string, Cached>();
const TTL_MS = 60_000; // 1 min — Yahoo data is delayed anyway
const STALE_MS = 30 * 60_000; // serve stale up to 30min on errors

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function fetchOne(symbol: string): Promise<Quote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=5d`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1) ** 2));
        continue;
      }
      if (!res.ok) return null;
      const json: any = await res.json();
      const r = json?.chart?.result?.[0];
      if (!r) return null;
      const m = r.meta ?? {};
      const price = Number(m.regularMarketPrice);
      const prev = Number(m.chartPreviousClose ?? m.previousClose ?? price);
      if (!Number.isFinite(price)) return null;
      const change = price - prev;
      return {
        symbol: (m.symbol ?? symbol).toUpperCase(),
        shortName: m.shortName ?? m.longName ?? m.symbol,
        regularMarketPrice: price,
        regularMarketPreviousClose: prev,
        regularMarketChange: change,
        regularMarketChangePercent: prev ? (change / prev) * 100 : 0,
        currency: m.currency ?? "USD",
        exchange: m.exchangeName ?? m.fullExchangeName,
        marketState: m.marketState,
      };
    } catch {
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  return null;
}

async function getCachedOrFetch(symbol: string): Promise<{ q: Quote | null; stale: boolean; err: boolean }> {
  const key = symbol.toUpperCase();
  const hit = CACHE.get(key);
  const now = Date.now();
  if (hit && now - hit.ts < TTL_MS) return { q: hit.quote, stale: false, err: false };
  const fresh = await fetchOne(key);
  if (fresh) {
    CACHE.set(key, { quote: fresh, ts: now });
    return { q: fresh, stale: false, err: false };
  }
  if (hit && now - hit.ts < STALE_MS) return { q: hit.quote, stale: true, err: true };
  return { q: null, stale: false, err: true };
}

// Concurrency limiter
async function mapLimit<T, R>(arr: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(arr.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, arr.length) }, async () => {
      while (i < arr.length) {
        const idx = i++;
        out[idx] = await fn(arr[idx]);
      }
    }),
  );
  return out;
}

export const getQuotes = createServerFn({ method: "POST" })
  .inputValidator((input) => QuoteInput.parse(input))
  .handler(async ({ data }): Promise<{ quotes: Quote[]; error: string | null }> => {
    const results = await mapLimit(data.symbols, 5, (s) => getCachedOrFetch(s));
    const quotes = results.map((r) => r.q).filter((q): q is Quote => !!q);
    const anyErr = results.some((r) => r.err);
    const anyStale = results.some((r) => r.stale);
    let error: string | null = null;
    if (quotes.length === 0 && anyErr) error = "Quote service unavailable (Yahoo Finance rate-limited)";
    else if (anyStale) error = "Some quotes are stale (Yahoo Finance throttled)";
    return { quotes, error };
  });

// ===== FX rates =====
// Returns rates relative to USD, plus arbitrary pairs requested.
const FxInput = z.object({
  currencies: z.array(z.string().min(3).max(5)).max(20),
});

export const getFxRates = createServerFn({ method: "POST" })
  .inputValidator((input) => FxInput.parse(input))
  .handler(async ({ data }): Promise<{ rates: Record<string, number>; error: string | null }> => {
    // We always include USD and EUR so the UI can convert between either.
    const set = new Set(data.currencies.map((c) => c.toUpperCase()));
    set.add("USD");
    set.add("EUR");
    // Build rates relative to USD: rates[X] = how many USD per 1 X.
    const rates: Record<string, number> = { USD: 1 };
    const needed = [...set].filter((c) => c !== "USD");

    const results = await mapLimit(needed, 5, async (cur) => {
      // For most currencies: `${cur}USD=X` means how many USD per 1 cur.
      const sym = `${cur}USD=X`;
      const q = await getCachedOrFetch(sym);
      return { cur, q };
    });
    let err = false;
    for (const { cur, q } of results) {
      if (q.q?.regularMarketPrice && Number.isFinite(q.q.regularMarketPrice)) {
        rates[cur] = q.q.regularMarketPrice;
      } else {
        err = true;
      }
    }
    return {
      rates,
      error: err ? "Some FX rates unavailable" : null,
    };
  });
