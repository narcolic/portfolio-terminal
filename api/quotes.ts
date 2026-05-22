import YahooFinance from "yahoo-finance2";

type ApiRequest = {
  method?: string;
  query?: {
    symbols?: string | string[];
  };
};

type ApiResponse = {
  status: (code: number) => {
    json: (body: unknown) => void;
  };
};

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  validation: {
    logErrors: false,
    logOptionsErrors: false,
  },
});

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Quote lookup failed";
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
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
  } catch (error: unknown) {
    res.status(500).json({ error: messageFrom(error) });
  }
}
