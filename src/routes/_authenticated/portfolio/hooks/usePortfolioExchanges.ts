import { useMemo } from "react";
import { usePortfolioData } from "@/routes/_authenticated/portfolio/hooks/usePortfolioData";

const GREEK_TICKERS = new Set(["AETF", "TPEIR", "TPEIR.AT"]);

function inferExchangeFromTicker(ticker: string): string | null {
  const t = ticker.toUpperCase();
  if (GREEK_TICKERS.has(t) || t.endsWith(".AT")) return "ATHEX";
  if (t.endsWith(".AS")) return "XAMS";
  if (t.endsWith(".PA")) return "EPA";
  if (t.endsWith(".L")) return "XLON";
  if (t.endsWith(".DE") || t.endsWith(".F")) return "XETR";
  if (/^[A-Z]{1,5}$/.test(t)) return "NYSE";
  return null;
}

const PRIORITY = ["ATHEX", "NYSE", "XAMS", "XLON", "XETR", "EPA"];

export function usePortfolioExchanges() {
  const { transactions } = usePortfolioData({ includePortfolios: false });

  return useMemo(() => {
    const set = new Set<string>();
    for (const tx of transactions) {
      const ex = inferExchangeFromTicker(tx.ticker);
      if (ex) set.add(ex);
    }
    if (set.size === 0) set.add("NYSE");
    return Array.from(set).sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  }, [transactions]);
}
