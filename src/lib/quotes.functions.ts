import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const QuoteInput = z.object({
  symbols: z.array(z.string().min(1).max(20)).min(1).max(100),
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

function parseTd(symbol: string, input: string, raw: any): Quote | null {
  if (!raw || raw.status === "error") return null;
  const price = Number(raw.close ?? raw.price);
  const prev = Number(raw.previous_close ?? price);
  if (!Number.isFinite(price)) return null;
  const rawCur = String(raw.currency ?? "USD").toUpperCase();
  const isPence = rawCur === "GBP" && price > 1000;
  const p = isPence ? price / 100 : price;
  const pp = isPence ? prev / 100 : prev;
  const change = p - pp;
  return {
    symbol: String(raw.symbol ?? symbol).toUpperCase(),
    inputSymbol: input.toUpperCase(),
    shortName: raw.name,
    regularMarketPrice: p,
    regularMarketPreviousClose: pp,
    regularMarketChange: change,
    regularMarketChangePercent: pp ? (change / pp) * 100 : 0,
    currency: isPence ? "GBP" : rawCur,
    exchange: raw.exchange,
    marketState: raw.is_market_open === false ? "CLOSED" : "REGULAR",
  };
}

async function fetchBatch(symbols: string[], apiKey: string): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  if (symbols.length === 0) return out;
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(
    symbols.join(","),
  )}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return out;
  const json: any = await res.json().catch(() => null);
  if (!json) return out;
  // Single-symbol responses are flat; multi-symbol are keyed by symbol.
  if (symbols.length === 1) {
    out.set(symbols[0].toUpperCase(), json);
  } else {
    for (const [k, v] of Object.entries(json)) out.set(k.toUpperCase(), v);
  }
  return out;
}

export const getQuotes = createServerFn({ method: "POST" })
  .inputValidator((input) => QuoteInput.parse(input))
  .handler(async ({ data }): Promise<{ quotes: Quote[]; error: string | null }> => {
    const apiKey = process.env.TWELVEDATA_API_KEY;
    if (!apiKey) return { quotes: [], error: "TWELVEDATA_API_KEY not configured" };

    const now = Date.now();
    const need: string[] = [];
    const cached = new Map<string, Quote>();
    for (const s of data.symbols) {
      const up = s.toUpperCase();
      const hit = QUOTE_CACHE.get(up);
      if (hit && now - hit.ts < TTL_MS) cached.set(up, hit.quote);
      else need.push(up);
    }

    let raw = new Map<string, any>();
    let fetchErr = false;
    try {
      // Twelve Data free tier: 8 req/min — batch in chunks of ~30 symbols
      const chunks: string[][] = [];
      for (let i = 0; i < need.length; i += 30) chunks.push(need.slice(i, i + 30));
      for (const c of chunks) {
        const m = await fetchBatch(c, apiKey);
        for (const [k, v] of m) raw.set(k, v);
      }
    } catch {
      fetchErr = true;
    }

    const quotes: Quote[] = [];
    let anyStale = false;
    for (const s of data.symbols) {
      const up = s.toUpperCase();
      if (cached.has(up)) {
        quotes.push(cached.get(up)!);
        continue;
      }
      const q = parseTd(up, up, raw.get(up));
      if (q) {
        QUOTE_CACHE.set(up, { quote: q, ts: now });
        quotes.push(q);
      } else {
        const hit = QUOTE_CACHE.get(up);
        if (hit && now - hit.ts < STALE_MS) {
          quotes.push(hit.quote);
          anyStale = true;
        }
      }
    }

    const missing = data.symbols.length - quotes.length;
    let error: string | null = null;
    if (quotes.length === 0 && (fetchErr || need.length > 0)) error = "Quote service unavailable";
    else if (missing > 0) error = `${missing} symbol(s) could not be priced — check ticker`;
    else if (anyStale) error = "Some quotes are stale";
    return { quotes, error };
  });

// ===== FX rates via Frankfurter (ECB, free, no key) =====
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
    } catch {
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
