import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TerminalCard } from "@/components/terminal/TerminalCard";
import { StatCard } from "@/components/terminal/StatCard";
import { TerminalTable, TerminalTd, TerminalTh } from "@/components/terminal/TerminalTable";
import {
  aggregateTransactions,
  enrich,
  fmt,
  fmtCurrency,
  fmtPct,
  type Enriched,
  type TransactionRow,
} from "@/lib/portfolio/portfolio";
import { getQuotesClient } from "@/lib/portfolio/quotes.functions";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/portfolio/")({
  component: Dashboard,
});

const ALL = "__all__";
const UNASSIGNED = "__unassigned__";

type Display = string;

type AssetType = "Stock" | "ETF" | "Fund" | "Unknown";
type RegionCategory =
  | "Greece"
  | "United States"
  | "Europe Developed"
  | "Emerging Markets"
  | "Global Developed"
  | "Global Thematic"
  | "Unknown";
type ThemeCategory =
  | "Broad Index"
  | "Bank"
  | "Semiconductor"
  | "Software"
  | "Europe Equity"
  | "EM Equity"
  | "Quantum/AI"
  | "Unknown";

type HoldingRegionClassification = {
  symbol: string;
  name: string;
  assetType: AssetType;
  exchange: string | null;
  currency: string | null;
  country: string | null;
  sector: string | null;
  industry: string | null;
  regionCategory: RegionCategory;
  themeCategory: ThemeCategory;
  sourceHints: string[];
  confidence: "High" | "Medium" | "Low";
};

type QuoteMeta = NonNullable<RowWithNative["quote"]> & {
  quoteType?: string;
  longName?: string;
  assetProfile?: { country?: string; sector?: string; industry?: string };
  fundProfile?: { category?: string; family?: string };
  price?: { longName?: string };
  quoteSummary?: { quoteType?: { quoteType?: string } };
  topHoldings?: Array<{ symbol?: string; weight?: number }>;
};

function Dashboard() {
  // Fetch positions directly from Supabase
  const txQ = useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("transaction_date", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  // Fetch portfolios directly from Supabase
  const portfoliosQ = useQuery({
    queryKey: ["portfolios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolios")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const [selected, setSelected] = useState<string>(ALL);
  const [display, setDisplay] = useState<Display>("USD");

  const positions = useMemo(
    () => aggregateTransactions((txQ.data ?? []) as TransactionRow[]),
    [txQ.data],
  );

  const tickers = useMemo(
    () => Array.from(new Set(positions.map((p) => p.ticker.toUpperCase()))),
    [positions],
  );

  const quotesQ = useQuery({
    queryKey: ["quotes", tickers.join(",")],
    queryFn: () => getQuotesClient(tickers),
    enabled: tickers.length > 0,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  const allRows = useMemo(
    () => enrich(positions, quotesQ.data?.quotes ?? []),
    [positions, quotesQ.data],
  );

  const transactionCurrencies = useMemo(() => {
    const s = new Set<string>();
    for (const p of positions) {
      const c = (p.currency || "").toUpperCase();
      if (c) s.add(c);
    }
    return s.size ? [...s].sort() : ["USD"];
  }, [positions]);

  const fxWanted = useMemo(
    () => Array.from(new Set(["USD", "EUR", ...transactionCurrencies])).sort(),
    [transactionCurrencies],
  );

  const fxQ = useQuery({
    queryKey: ["fx-rates", fxWanted.join(",")],
    queryFn: async () => {
      const wanted = Array.from(new Set(fxWanted.map((c) => c.toUpperCase())));

      const toUsdPerUnit = (allRates: Record<string, number>) => {
        const rates: Record<string, number> = { USD: 1 };
        for (const c of wanted) {
          if (c === "USD") continue;
          const usdToC = Number(allRates[c]);
          if (Number.isFinite(usdToC) && usdToC > 0) {
            rates[c] = 1 / usdToC;
          }
        }
        return rates;
      };

      try {
        // Fetch full USD base table to avoid failures from unsupported target codes.
        const url = "https://api.frankfurter.app/latest?from=USD";
        const response = await fetch(url);
        if (response.ok) {
          const data = (await response.json()) as { rates?: Record<string, number> };
          if (data.rates) {
            return { rates: toUsdPerUnit(data.rates) };
          }
        }
      } catch {
        // fallback below
      }

      try {
        // Fallback provider
        const response = await fetch("https://open.er-api.com/v6/latest/USD");
        if (response.ok) {
          const data = (await response.json()) as { rates?: Record<string, number> };
          if (data.rates) {
            return { rates: toUsdPerUnit(data.rates) };
          }
        }
      } catch {
        // final fallback below
      }

      return { rates: { USD: 1, EUR: 1 } };
    },
    staleTime: 10 * 60_000,
    gcTime: 24 * 60 * 60_000,
  });

  // rates[X] = USD per 1 X
  const rates = useMemo<Record<string, number>>(() => fxQ.data?.rates ?? { USD: 1 }, [fxQ.data]);

  const convert = useMemo(() => {
    const dispRate = rates[display] ?? 1; // USD per 1 display unit
    return (amount: number, from: string) => {
      const f = (from || "USD").toUpperCase();
      const fromRate = rates[f] ?? 1; // USD per 1 from
      if (!fromRate || !dispRate) return amount; // missing — leave as-is
      const inUsd = amount * fromRate;
      return inUsd / dispRate;
    };
  }, [rates, display]);

  const convRows = useMemo(
    () =>
      allRows.map((r) => ({
        ...r,
        _nativeCurrency: (r.quote?.currency ?? r.currency ?? "USD").toUpperCase(),
      })),
    [allRows],
  );

  const rows = useMemo(() => {
    if (selected === ALL) return convRows;
    if (selected === UNASSIGNED) return convRows.filter((r) => !r.portfolio_id);
    return convRows.filter((r) => r.portfolio_id === selected);
  }, [convRows, selected]);

  const displayCurrencies = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const c = (r.currency || "").toUpperCase();
      if (c) s.add(c);
    }
    if (s.size === 0) {
      for (const c of transactionCurrencies) s.add(c);
    }
    return [...s].sort();
  }, [rows, transactionCurrencies]);

  useEffect(() => {
    if (!displayCurrencies.includes(display)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(displayCurrencies[0] ?? "USD");
    }
  }, [display, displayCurrencies]);

  const portfolioMap = useMemo(
    () => new Map((portfoliosQ.data ?? []).map((p) => [p.id, p.name])),
    [portfoliosQ.data],
  );

  const totals = useMemo(() => computeTotals(rows, convert), [rows, convert]);

  const byPortfolio = useMemo(() => {
    const groups = new Map<string, typeof convRows>();
    for (const r of convRows) {
      const key = r.portfolio_id ?? UNASSIGNED;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    return Array.from(groups, ([id, items]) => {
      const t = computeTotals(items, convert);
      return {
        id,
        name: id === UNASSIGNED ? "Unassigned" : (portfolioMap.get(id) ?? "—"),
        count: items.length,
        ...t,
      };
    }).sort((a, b) => b.mv - a.mv);
  }, [convRows, portfolioMap, convert]);

  const byType = useMemo(() => groupSum(rows, (r) => r.asset_type, convert), [rows, convert]);
  const regionHoldings = useMemo(() => rows.map(classifyHolding), [rows]);
  const byRegion = useMemo(() => {
    const m = new Map<string, number>();
    for (const [index, r] of rows.entries()) {
      const region = regionHoldings[index]?.regionCategory ?? "Unknown";
      m.set(region, (m.get(region) ?? 0) + convert(r.marketValue, r._nativeCurrency));
    }
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [rows, convert, regionHoldings]);
  const byCurrency = useMemo(
    () => groupSumNative(rows, (r) => r._nativeCurrency || "UNKNOWN"),
    [rows],
  );

  if (txQ.isLoading) return <Skeleton />;
  if ((txQ.data ?? []).length === 0) return <EmptyState />;

  const tabs = [
    { id: ALL, label: "ALL" },
    ...byPortfolio.map((g) => ({ id: g.id, label: g.name.toUpperCase() })),
  ];

  const dispFmt = (n: number) => fmtCurrency(n, display);

  return (
    <div className="space-y-6">
      {/* Portfolio tabs + currency toggle */}
      <div className="flex flex-col md:flex-row gap-3 md:items-stretch">
        <div className="border border-border bg-card overflow-x-auto flex-1">
          <div className="flex text-[11px] uppercase tracking-[0.2em]">
            {tabs.map((t) => {
              const active = selected === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`px-4 py-2 border-r border-border whitespace-nowrap ${
                    active ? "bg-primary text-primary-foreground font-bold" : "hover:text-primary"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          onClick={() => {
            quotesQ.refetch();
          }}
          disabled={tickers.length === 0}
          className="border border-border bg-card px-4 text-[11px] uppercase tracking-[0.2em] hover:text-primary disabled:opacity-50"
        >
          sync
        </button>
        <div className="border border-border bg-card flex">
          {displayCurrencies.map((c) => (
            <button
              key={c}
              onClick={() => setDisplay(c)}
              className={`px-4 text-[11px] uppercase tracking-[0.2em] border-r border-border last:border-r-0 ${
                display === c
                  ? "bg-primary text-primary-foreground font-bold"
                  : "hover:text-primary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label={selected === ALL ? `NET WORTH (${display})` : `PORTFOLIO VALUE (${display})`}
          value={dispFmt(totals.mv)}
          accent
        />
        <StatCard
          label="DAY P&L"
          value={dispFmt(totals.dayChange)}
          sub={fmtPct(totals.dayPct)}
          tone={totals.dayChange >= 0 ? "bull" : "bear"}
        />
        <StatCard
          label="UNREALIZED"
          value={dispFmt(totals.unrealized)}
          sub={fmtPct(totals.unrealizedPct)}
          tone={totals.unrealized >= 0 ? "bull" : "bear"}
        />
        <StatCard label="COST BASIS" value={dispFmt(totals.cost)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TerminalCard title="ALLOCATION // BY TYPE">
          <Breakdown data={byType} total={totals.mv} chart="pie" display={display} />
        </TerminalCard>
        <TerminalCard title="ALLOCATION // BY REGION">
          <Breakdown data={byRegion} total={totals.mv} chart="bar" display={display} />
        </TerminalCard>
        <TerminalCard title="ALLOCATION // BY CURRENCY">
          <Breakdown
            data={byCurrency}
            total={byCurrency.reduce((sum, item) => sum + item.value, 0)}
            chart="pie"
            display={display}
            formatter={(value, currency) => fmtCurrency(value, currency)}
          />
        </TerminalCard>
      </div>

      <TerminalCard
        title="HOLDINGS"
        actions={
          <span className="text-[10px] text-muted-foreground">{`${rows.length} positions · ${display}`}</span>
        }
      >
        <div className="overflow-x-auto">
          <TerminalTable>
            <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr className="border-b border-border">
                <TerminalTh className="text-left">Ticker</TerminalTh>
                <TerminalTh className="text-right">Quantity</TerminalTh>
                <TerminalTh className="text-right">Price (Current)</TerminalTh>
                <TerminalTh className="text-right">Price (Avg)</TerminalTh>
                <TerminalTh className="text-right">Day %</TerminalTh>
                <TerminalTh className="text-right">Mkt Value ({display})</TerminalTh>
                <TerminalTh className="text-right">Tx</TerminalTh>
                <TerminalTh className="text-right">Unrealized ({display})</TerminalTh>
                <TerminalTh className="text-right">P&L %</TerminalTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const native = r._nativeCurrency;
                const mvDisp = convert(r.marketValue, native);
                const unrealDisp = convert(r.unrealized, native);
                return (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-secondary/40">
                    <td className="py-2 px-2">
                      <div className="font-bold text-primary">{r.ticker}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                        {r.quote?.shortName || r.name || r.asset_type} · {native}
                      </div>
                    </td>
                    <TerminalTd>{fmt(r.shares, { maximumFractionDigits: 2 })}</TerminalTd>
                    <TerminalTd>{fmtCurrency(r.price, native)}</TerminalTd>
                    <TerminalTd>{fmtCurrency(r.avg_cost, native)}</TerminalTd>
                    <TerminalTd tone={r.dayChangePct >= 0 ? "bull" : "bear"}>
                      {fmtPct(r.dayChangePct)}
                    </TerminalTd>
                    <TerminalTd>{dispFmt(mvDisp)}</TerminalTd>
                    <TerminalTd>{r.tx_count}</TerminalTd>
                    <TerminalTd tone={r.unrealized >= 0 ? "bull" : "bear"}>
                      {dispFmt(unrealDisp)}
                    </TerminalTd>
                    <TerminalTd tone={r.unrealizedPct >= 0 ? "bull" : "bear"}>
                      {fmtPct(r.unrealizedPct)}
                    </TerminalTd>
                  </tr>
                );
              })}
            </tbody>
          </TerminalTable>
        </div>
      </TerminalCard>
    </div>
  );
}

type ConvFn = (amt: number, from: string) => number;
type RowWithNative = Enriched & { _nativeCurrency: string };

function computeTotals(rows: RowWithNative[], convert: ConvFn) {
  let mv = 0,
    cost = 0,
    dayChange = 0;
  for (const r of rows) {
    const cur = r._nativeCurrency;
    mv += convert(r.marketValue, cur);
    cost += convert(r.costBasis, cur);
    dayChange += convert(r.dayChange, cur);
  }
  const unrealized = mv - cost;
  return {
    mv,
    cost,
    dayChange,
    unrealized,
    dayPct: mv - dayChange ? (dayChange / (mv - dayChange)) * 100 : 0,
    unrealizedPct: cost ? (unrealized / cost) * 100 : 0,
  };
}

function groupSum(rows: RowWithNative[], key: (r: RowWithNative) => string, convert: ConvFn) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = convert(r.marketValue, r._nativeCurrency);
    m.set(key(r), (m.get(key(r)) ?? 0) + v);
  }
  return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function groupSumNative(rows: RowWithNative[], key: (r: RowWithNative) => string) {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(key(r), (m.get(key(r)) ?? 0) + r.marketValue);
  }
  return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

const REGION_OVERRIDES: Record<string, RegionCategory> = {
  AETF: "Greece",
  "TPEIR.AT": "Greece",
  VUAA: "United States",
  DGRP: "United States",
  DGRW: "United States",
  QTUM: "Global Thematic",
  QUTM: "Global Thematic",
};

const REGION_PREFIX_OVERRIDES: Array<[string, RegionCategory]> = [
  ["VUAA", "United States"],
  ["SMEA", "Europe Developed"],
  ["EIMI", "Emerging Markets"],
];

const EUROPE_COUNTRIES = new Set([
  "Austria",
  "Belgium",
  "Denmark",
  "Finland",
  "France",
  "Germany",
  "Ireland",
  "Italy",
  "Netherlands",
  "Norway",
  "Portugal",
  "Spain",
  "Sweden",
  "Switzerland",
  "United Kingdom",
]);

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function classifyHolding(row: RowWithNative): HoldingRegionClassification {
  const symbol = row.ticker.toUpperCase();
  const symbolBase = symbol.split(/[.:]/)[0];
  const quote = row.quote as QuoteMeta | undefined;
  const hints: string[] = [];
  const name = row.name ?? quote?.shortName ?? quote?.longName ?? row.ticker;

  const exchange = quote?.exchange ?? null;
  const exchangeName = normalizeText(exchange);
  const currency = (quote?.currency ?? row.currency ?? "USD").toUpperCase();
  const country = quote?.assetProfile?.country ?? null;
  const sector = quote?.assetProfile?.sector ?? null;
  const industry = quote?.assetProfile?.industry ?? null;

  const fundCategory = normalizeText(quote?.fundProfile?.category);
  const fundFamily = normalizeText(quote?.fundProfile?.family);
  const quoteShortName = normalizeText(quote?.shortName);
  const quoteLongName = normalizeText(quote?.longName);
  const priceLongName = normalizeText(quote?.price?.longName);
  const fullName = normalizeText(
    `${fundCategory} ${fundFamily} ${quoteShortName} ${quoteLongName} ${priceLongName} ${row.name}`,
  );

  const rawQuoteType = normalizeText(
    quote?.quoteType ?? quote?.quoteSummary?.quoteType?.quoteType ?? row.asset_type,
  );
  let assetType: AssetType = "Unknown";
  if (rawQuoteType === "equity" || rawQuoteType === "common stock" || rawQuoteType === "stock")
    assetType = "Stock";
  else if (
    rawQuoteType === "etf" ||
    quoteShortName.includes("etf") ||
    quoteLongName.includes("etf")
  )
    assetType = "ETF";
  else if (
    rawQuoteType === "mutualfund" ||
    rawQuoteType === "mutual fund" ||
    rawQuoteType === "fund"
  )
    assetType = "Fund";
  else if (normalizeText(row.asset_type).includes("etf")) assetType = "ETF";
  else if (normalizeText(row.asset_type).includes("mutual")) assetType = "Fund";
  else if (normalizeText(row.asset_type).includes("stock")) assetType = "Stock";

  if (assetType === "Unknown" && exchangeName) {
    if (
      exchangeName.includes("nasdaq") ||
      exchangeName.includes("nyse") ||
      exchangeName.includes("new york") ||
      exchangeName.includes("nyse american")
    ) {
      assetType = "Stock";
    } else if (exchangeName.includes("athens") || exchangeName.includes("athex")) {
      assetType = "ETF";
    }
  }

  if (country) hints.push(`country=${country}`);
  if (sector) hints.push(`sector=${sector}`);
  if (industry) hints.push(`industry=${industry}`);
  if (exchange) hints.push(`exchange=${exchange}`);
  if (quote?.shortName) hints.push("shortName");
  if (quote?.longName) hints.push("longName");
  if (quote?.fundProfile?.category) hints.push(`fund category=${quote.fundProfile.category}`);
  if (quote?.fundProfile?.family) hints.push(`fund family=${quote.fundProfile.family}`);
  if (quote?.price?.longName) hints.push("price.longName");
  if (quote?.topHoldings?.length) hints.push("topHoldings");

  let regionCategory: RegionCategory = "Unknown";
  const overrideRegion = REGION_OVERRIDES[symbol] ?? REGION_OVERRIDES[symbolBase] ?? undefined;
  if (overrideRegion) {
    regionCategory = overrideRegion;
    hints.push("manual override");
  } else {
    const prefixOverride = REGION_PREFIX_OVERRIDES.find(
      ([prefix]) => symbol.startsWith(prefix) || symbolBase.startsWith(prefix),
    );
    if (prefixOverride) {
      regionCategory = prefixOverride[1];
      hints.push("manual prefix override");
    }
  }

  if (regionCategory === "Unknown") {
    if (assetType === "Stock") {
      const normalizedCountry = normalizeText(country);
      if (normalizedCountry === "greece") regionCategory = "Greece";
      else if (normalizedCountry === "united states") regionCategory = "United States";
      else if (EUROPE_COUNTRIES.has(country ?? "")) regionCategory = "Europe Developed";
      else if (
        exchangeName.includes("nasdaq") ||
        exchangeName.includes("nyse") ||
        exchangeName.includes("new york")
      ) {
        regionCategory = "United States";
        hints.push("exchange inferred United States");
      } else if (exchangeName.includes("athens") || exchangeName.includes("athex")) {
        regionCategory = "Greece";
        hints.push("exchange inferred Greece");
      } else if (
        exchangeName.includes("london") ||
        exchangeName.includes("lse") ||
        exchangeName.includes("xlon")
      ) {
        regionCategory = "Europe Developed";
        hints.push("exchange inferred Europe Developed");
      } else if (quoteShortName.includes("greece") || quoteLongName.includes("greece")) {
        regionCategory = "Greece";
      } else if (
        quoteShortName.includes("united states") ||
        quoteLongName.includes("united states") ||
        quoteShortName.includes("usa") ||
        quoteLongName.includes("usa")
      ) {
        regionCategory = "United States";
      } else if (quoteShortName.includes("europe") || quoteLongName.includes("europe")) {
        regionCategory = "Europe Developed";
      }
    } else {
      if (fullName.includes("greece")) {
        regionCategory = "Greece";
      } else if (
        fullName.includes("s&p 500") ||
        fullName.includes("usa") ||
        fullName.includes("us equity") ||
        fullName.includes("u.s. equity") ||
        fullName.includes("us stock")
      ) {
        regionCategory = "United States";
      } else if (fullName.includes("europe") && !fullName.includes("emerging")) {
        regionCategory = "Europe Developed";
      } else if (
        fullName.includes("emerging markets") ||
        fullName.includes("em equity") ||
        /\bem\b/.test(fullName)
      ) {
        regionCategory = "Emerging Markets";
      } else if (
        /quantum|ai|artificial intelligence|machine learning|robotics|cloud|cybersecurity|cyber security/.test(
          fullName,
        )
      ) {
        regionCategory = "Global Thematic";
      } else if (
        fullName.includes("global") ||
        fullName.includes("world") ||
        fullName.includes("developed world") ||
        fullName.includes("all world")
      ) {
        regionCategory = "Global Developed";
      }
    }
  }

  let themeCategory: ThemeCategory = "Unknown";
  const sectorText = normalizeText(sector);
  const industryText = normalizeText(industry);
  if (industryText.includes("bank") || fullName.includes("bank")) themeCategory = "Bank";
  else if (industryText.includes("semiconductor") || fullName.includes("semiconductor"))
    themeCategory = "Semiconductor";
  else if (
    sectorText.includes("software") ||
    industryText.includes("software") ||
    /software|internet|application|saas|cloud/.test(fullName)
  ) {
    themeCategory = "Software";
  } else if (
    assetType !== "Stock" &&
    (fullName.includes("s&p 500") || fullName.includes("broad index") || fullName.includes("index"))
  ) {
    themeCategory = "Broad Index";
  } else if (assetType !== "Stock" && fullName.includes("europe")) {
    themeCategory = "Europe Equity";
  } else if (
    assetType !== "Stock" &&
    (fullName.includes("emerging markets") || fullName.includes("em equity"))
  ) {
    themeCategory = "EM Equity";
  } else if (
    /quantum|ai|artificial intelligence|machine learning|robotics|cloud|cybersecurity|cyber security/.test(
      fullName,
    )
  ) {
    themeCategory = "Quantum/AI";
  }

  let confidence: "High" | "Medium" | "Low" = "Low";
  if (regionCategory !== "Unknown" && country) confidence = "High";
  if (
    regionCategory !== "Unknown" &&
    fullName.match(/s&p 500|usa|us equity|europe|emerging markets|global|world/)
  ) {
    confidence = confidence === "High" ? "High" : "Medium";
  }
  if (
    REGION_OVERRIDES[symbol] ||
    REGION_PREFIX_OVERRIDES.some(([prefix]) => symbol.startsWith(prefix))
  ) {
    confidence = "High";
  }
  if (regionCategory === "Unknown" && fullName) {
    confidence = "Low";
  }

  return {
    symbol,
    name,
    assetType,
    exchange,
    currency,
    country,
    sector,
    industry,
    regionCategory,
    themeCategory,
    sourceHints: hints,
    confidence,
  };
}

const COLORS = [
  "var(--color-primary)",
  "var(--color-bull)",
  "var(--color-amber)",
  "var(--color-chart-5)",
  "var(--color-bear)",
  "#a78bfa",
  "#f59e0b",
];

function Breakdown({
  data,
  total,
  chart,
  display,
  formatter,
}: {
  data: { name: string; value: number }[];
  total: number;
  chart: "pie" | "bar";
  display: Display;
  formatter?: (value: number, name: string) => string;
}) {
  if (data.length === 0) return <div className="text-muted-foreground text-xs">No data</div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
      <div className="h-48">
        <ResponsiveContainer>
          {chart === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={45}
                outerRadius={80}
                stroke="var(--color-background)"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  fontSize: 11,
                }}
                wrapperStyle={{ color: "var(--color-foreground)" }}
                labelStyle={{ color: "var(--color-foreground)" }}
                itemStyle={{ color: "var(--color-foreground)" }}
                formatter={(v: number) => fmtCurrency(v, display)}
              />
            </PieChart>
          ) : (
            <BarChart data={data}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  fontSize: 11,
                }}
                wrapperStyle={{ color: "var(--color-foreground)" }}
                labelStyle={{ color: "var(--color-foreground)" }}
                itemStyle={{ color: "var(--color-foreground)" }}
                formatter={(v: number) => fmtCurrency(v, display)}
              />
              <Bar dataKey="value">
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="space-y-1 text-[12px]">
        {data.map((d, i) => {
          const pct = total ? (d.value / total) * 100 : 0;
          return (
            <div
              key={d.name}
              className="flex items-center justify-between border-b border-border/40 py-1"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="uppercase text-[11px]">{d.name}</span>
              </div>
              <div className="text-right">
                <div>{formatter ? formatter(d.value, d.name) : fmtCurrency(d.value, display)}</div>
                <div className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 border border-border bg-card animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border p-12 text-center">
      <div className="text-[10px] uppercase tracking-[0.3em] text-primary">// NO TRANSACTIONS</div>
      <h2 className="mt-3 text-2xl">Your portfolio is empty</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Add your first transaction to start tracking live values.
      </p>
      <Link
        to="/portfolio/positions"
        className="inline-block mt-6 bg-primary text-primary-foreground px-6 py-2 text-xs uppercase tracking-[0.25em] font-bold hover:opacity-90"
      >
        &gt; ADD TRANSACTION
      </Link>
    </div>
  );
}
