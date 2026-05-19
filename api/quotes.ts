import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  validation: {
    logErrors: false,
    logOptionsErrors: false,
  },
});

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const raw = typeof req.query?.symbols === "string" ? req.query.symbols : "";
    const symbols = Array.from(
      new Set(
        raw
          .split(",")
          .map((s: string) => s.trim().toUpperCase())
          .filter((s: string): s is string => s.length > 0),
      ),
    ).slice(0, 100) as string[];

    if (symbols.length === 0) {
      res.status(200).json({ quotes: [] });
      return;
    }

    const quotes = await yahooFinance.quote(symbols);
    const out = Array.isArray(quotes) ? quotes : [quotes];
    res.status(200).json({ quotes: out });
  } catch (error: any) {
    res.status(500).json({ error: error?.message ?? "Quote lookup failed" });
  }
}
