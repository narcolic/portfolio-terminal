// Fetch quotes via Yahoo's public chart endpoint.
// Works in Node and Cloudflare Workers (no Node-only deps).
// The v7/quote endpoint now requires a crumb/cookie; v8/chart does not.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchOne(symbol: string): Promise<any | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;
    return {
      symbol: meta.symbol ?? symbol,
      shortName: meta.shortName ?? meta.longName,
      longName: meta.longName,
      regularMarketPrice: meta.regularMarketPrice,
      regularMarketPreviousClose:
        meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice,
      currency: meta.currency,
      exchange: meta.exchangeName,
      fullExchangeName: meta.fullExchangeName ?? meta.exchangeName,
      marketState: meta.marketState,
    };
  } catch (e) {
    console.error(`yahoo chart fetch failed for ${symbol}:`, e);
    return null;
  }
}

export async function fetchYahooQuotes(symbols: string[]): Promise<any[]> {
  if (symbols.length === 0) return [];
  const results = await Promise.all(symbols.map(fetchOne));
  return results.filter((r): r is any => r !== null);
}
