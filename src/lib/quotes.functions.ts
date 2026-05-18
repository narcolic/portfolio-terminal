import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const QuoteInput = z.object({
  symbols: z.array(z.string().min(1).max(20)).min(1).max(50),
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

export const getQuotes = createServerFn({ method: "POST" })
  .inputValidator((input) => QuoteInput.parse(input))
  .handler(async ({ data }): Promise<{ quotes: Quote[]; error: string | null }> => {
    try {
      const url = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
      url.searchParams.set("symbols", data.symbols.join(","));
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        return { quotes: [], error: `Yahoo Finance ${res.status}` };
      }
      const json = (await res.json()) as { quoteResponse?: { result?: Quote[] } };
      return { quotes: json.quoteResponse?.result ?? [], error: null };
    } catch (e) {
      console.error("getQuotes failed", e);
      return { quotes: [], error: "Quote service unavailable" };
    }
  });
