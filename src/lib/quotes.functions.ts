import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const QuoteInput = z.object({
  symbols: z.array(z.string().min(1).max(20)).min(1).max(100),
});

export interface Quote {
  symbol: string;            // resolved symbol used to fetch (e.g. VUAA.L)
  inputSymbol: string;       // original user input (e.g. IE00BFMXXD54)
  shortName?: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  currency: string;
  exchange?: string;
  marketState?: string;
}

// ===== Caches =====
type CachedQ = { quote: Quote; ts: number };
const QUOTE_CACHE = new Map<string, CachedQ>();        // key = resolved symbol
const RESOLVE_CACHE = new Map<string, string>();        // ISIN -> resolved symbol
const TTL_MS = 60_000;
const STALE_MS = 30 * 60_000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const isIsin = (s: string) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s.toUpperCase());

async function yahooFetch(url: string, attempts = 3): Promise<Response | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 250 * (i + 1) ** 2));
        continue;
      }
      return res;
    } catch {
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
  return null;
}

// Try Yahoo search to map ISIN → tradeable ticker (prefer LSE / Xetra / Amsterdam)
async function resolveSymbol(input: string): Promise<string> {
  const up = input.toUpperCase();
  if (!isIsin(up)) return up;
  if (RESOLVE_CACHE.has(up)) return RESOLVE_CACHE.get(up)!;

  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    up,
  )}&quotesCount=8&newsCount=0`;
  const res = await yahooFetch(url);
  if (!res || !res.ok) return up;
  try {
    const json: any = await res.json();
    const quotes: any[] = json?.quotes ?? [];
    // Prefer real listed ETFs/equities on major exchanges
    const exchPref = ["LSE", "AMS", "GER", "STU", "EBS", "MIL", "NMS", "NYQ", "PAR"];
    const scored = quotes
      .filter((q) => q.symbol && q.quoteType !== "MUTUALFUND")
      .sort((a, b) => {
        const ai = exchPref.indexOf(a.exchange);
        const bi = exchPref.indexOf(b.exchange);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      });
    const pick = scored[0]?.symbol ?? quotes[0]?.symbol ?? up;
    RESOLVE_CACHE.set(up, pick);
    return pick;
  } catch {
    return up;
  }
}

async function fetchQuoteBySymbol(symbol: string): Promise<Omit<Quote, "inputSymbol"> | null> {
  const encoded = encodeURIComponent(symbol);
  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5d`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5d`,
  ];
  let res: Response | null = null;
  for (const url of urls) {
    res = await yahooFetch(url, 2);
    if (res?.ok) break;
  }
  if (!res || !res.ok) return null;
  try {
    const json: any = await res.json();
    const r = json?.chart?.result?.[0];
    if (!r) return null;
    const m = r.meta ?? {};
    const closes = (r.indicators?.quote?.[0]?.close ?? []).filter((v: unknown) => Number.isFinite(Number(v)));
    const rawPrice = Number(m.regularMarketPrice ?? closes.at(-1));
    const rawPrev = Number(m.chartPreviousClose ?? m.previousClose ?? closes.at(-2) ?? rawPrice);
    const yahooCurrency = String(m.currency ?? "USD");
    const isPence = yahooCurrency.toUpperCase() === "GBP" && rawPrice > 1000 || yahooCurrency.toUpperCase() === "GBX" || yahooCurrency === "GBp";
    const price = isPence ? rawPrice / 100 : rawPrice;
    const prev = isPence ? rawPrev / 100 : rawPrev;
    if (!Number.isFinite(price)) return null;
    const change = price - prev;
    return {
      symbol: (m.symbol ?? symbol).toUpperCase(),
      shortName: m.shortName ?? m.longName ?? m.symbol,
      regularMarketPrice: price,
      regularMarketPreviousClose: prev,
      regularMarketChange: change,
      regularMarketChangePercent: prev ? (change / prev) * 100 : 0,
      currency: isPence ? "GBP" : yahooCurrency,
      exchange: m.exchangeName ?? m.fullExchangeName,
      marketState: m.marketState,
    };
  } catch {
    return null;
  }
}

async function getQuoteFor(input: string): Promise<{ q: Quote | null; stale: boolean; err: boolean }> {
  const up = input.toUpperCase();
  const resolved = await resolveSymbol(up);
  const cacheKey = resolved;
  const hit = QUOTE_CACHE.get(cacheKey);
  const now = Date.now();
  if (hit && now - hit.ts < TTL_MS) return { q: hit.quote, stale: false, err: false };
  const fresh = await fetchQuoteBySymbol(resolved);
  if (fresh) {
    const q: Quote = { ...fresh, inputSymbol: up };
    QUOTE_CACHE.set(cacheKey, { quote: q, ts: now });
    return { q, stale: false, err: false };
  }
  if (hit && now - hit.ts < STALE_MS) return { q: hit.quote, stale: true, err: true };
  return { q: null, stale: false, err: true };
}

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
    const results = await mapLimit(data.symbols, 2, (s) => getQuoteFor(s));
    const quotes = results.map((r) => r.q).filter((q): q is Quote => !!q);
    const anyErr = results.some((r) => r.err);
    const anyStale = results.some((r) => r.stale);
    const missing = data.symbols.length - quotes.length;
    let error: string | null = null;
    if (quotes.length === 0 && anyErr) error = "Quote service unavailable";
    else if (missing > 0) error = `${missing} symbol(s) could not be priced — check ticker`;
    else if (anyStale) error = "Some quotes are stale";
    return { quotes, error };
  });

// ===== FX rates via Frankfurter (ECB, free, no key, no rate limits) =====
const FxInput = z.object({
  currencies: z.array(z.string().min(3).max(5)).max(20),
});

type FxCache = { rates: Record<string, number>; ts: number };
let FX_CACHE: FxCache | null = null;
const FX_TTL_MS = 10 * 60_000;
const FX_STALE_MS = 24 * 60 * 60_000;

export const getFxRates = createServerFn({ method: "POST" })
  .inputValidator((input) => FxInput.parse(input))
  .handler(async ({ data }): Promise<{ rates: Record<string, number>; error: string | null }> => {
    const set = new Set(data.currencies.map((c) => c.toUpperCase()));
    set.add("USD");
    set.add("EUR");
    const wanted = [...set];

    const now = Date.now();
    if (FX_CACHE && now - FX_CACHE.ts < FX_TTL_MS) {
      return { rates: pickRates(FX_CACHE.rates, wanted), error: null };
    }

    // Frankfurter returns rates relative to a base. We use USD as base.
    // rates[X] in our app = USD per 1 unit of X.
    // Frankfurter: { base: "USD", rates: { EUR: 0.92, GBP: 0.78, ... } }
    // means 1 USD = 0.92 EUR  →  1 EUR = 1/0.92 USD
    const symbols = wanted.filter((c) => c !== "USD").join(",");
    const url = `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${encodeURIComponent(symbols)}`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`fx ${res.status}`);
      const json: any = await res.json();
      const usdPerUnit: Record<string, number> = { USD: 1 };
      for (const [code, perUsd] of Object.entries(json?.rates ?? {})) {
        const n = Number(perUsd);
        if (Number.isFinite(n) && n > 0) usdPerUnit[code] = 1 / n;
      }
      FX_CACHE = { rates: usdPerUnit, ts: now };
      return { rates: pickRates(usdPerUnit, wanted), error: null };
    } catch (e) {
      if (FX_CACHE && now - FX_CACHE.ts < FX_STALE_MS) {
        return { rates: pickRates(FX_CACHE.rates, wanted), error: "FX rates stale" };
      }
      return { rates: { USD: 1 }, error: "FX rates unavailable" };
    }
  });

function pickRates(all: Record<string, number>, wanted: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of wanted) if (all[c]) out[c] = all[c];
  if (!out.USD) out.USD = 1;
  return out;
}
