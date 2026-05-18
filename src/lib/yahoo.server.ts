import yahooFinance from "yahoo-finance2";

(yahooFinance as any).suppressNotices?.(["yahooSurvey"]);
(yahooFinance as any).setGlobalConfig?.({
  validation: { logErrors: false, logOptionsErrors: false },
});

export async function fetchYahooQuotes(symbols: string[]): Promise<any[]> {
  if (symbols.length === 0) return [];
  const res = await yahooFinance.quote(symbols, { return: "array" } as any);
  return Array.isArray(res) ? res : [res];
}
