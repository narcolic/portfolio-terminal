import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  aggregateTransactions, enrich, fmt, fmtCurrency, fmtPct,
  type Enriched, type TransactionRow,
} from "@/lib/portfolio";
import { getQuotesClient } from "@/lib/quotes.functions";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const ALL = "__all__";
const UNASSIGNED = "__unassigned__";

type Display = string;

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
  const rates: Record<string, number> = fxQ.data?.rates ?? { USD: 1 };

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
    () => allRows.map((r) => ({
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
        name: id === UNASSIGNED ? "Unassigned" : portfolioMap.get(id) ?? "—",
        count: items.length,
        ...t,
      };
    }).sort((a, b) => b.mv - a.mv);
  }, [convRows, portfolioMap, convert]);

  const byType = useMemo(() => groupSum(rows, (r) => r.asset_type, convert), [rows, convert]);
  const byMarket = useMemo(
    () => groupSum(rows, (r) => r.market || r.quote?.exchange || "—", convert),
    [rows, convert],
  );
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
                display === c ? "bg-primary text-primary-foreground font-bold" : "hover:text-primary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={selected === ALL ? `NET WORTH (${display})` : `PORTFOLIO VALUE (${display})`} value={dispFmt(totals.mv)} accent />
        <Stat
          label="DAY P&L"
          value={dispFmt(totals.dayChange)}
          sub={fmtPct(totals.dayPct)}
          tone={totals.dayChange >= 0 ? "bull" : "bear"}
        />
        <Stat
          label="UNREALIZED"
          value={dispFmt(totals.unrealized)}
          sub={fmtPct(totals.unrealizedPct)}
          tone={totals.unrealized >= 0 ? "bull" : "bear"}
        />
        <Stat label="COST BASIS" value={dispFmt(totals.cost)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="ALLOCATION // BY TYPE">
          <Breakdown data={byType} total={totals.mv} chart="pie" display={display} />
        </Panel>
        <Panel title="ALLOCATION // BY MARKET">
          <Breakdown data={byMarket} total={totals.mv} chart="bar" display={display} />
        </Panel>
        <Panel title="ALLOCATION // BY CURRENCY">
          <Breakdown
            data={byCurrency}
            total={byCurrency.reduce((sum, item) => sum + item.value, 0)}
            chart="pie"
            display={display}
            formatter={(value, currency) => fmtCurrency(value, currency)}
          />
        </Panel>
      </div>

      <Panel
        title="HOLDINGS"
        actions={
          <span className="text-[10px] text-muted-foreground">{`${rows.length} positions · ${display}`}</span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr className="border-b border-border">
                <Th className="text-left">Ticker</Th>
                <Th className="text-right">Shares</Th>
                <Th className="text-right">Price (native)</Th>
                <Th className="text-right">Day %</Th>
                <Th className="text-right">Mkt Value ({display})</Th>
                <Th className="text-right">Avg Cost</Th>
                <Th className="text-right">Tx</Th>
                <Th className="text-right">Unrealized ({display})</Th>
                <Th className="text-right">P&L %</Th>
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
                    <Td>{fmt(r.shares, { maximumFractionDigits: 4 })}</Td>
                    <Td>{fmtCurrency(r.price, native)}</Td>
                    <Td tone={r.dayChangePct >= 0 ? "bull" : "bear"}>{fmtPct(r.dayChangePct)}</Td>
                    <Td>{dispFmt(mvDisp)}</Td>
                    <Td>{fmt(r.avg_cost)}</Td>
                    <Td>{r.tx_count}</Td>
                    <Td tone={r.unrealized >= 0 ? "bull" : "bear"}>{dispFmt(unrealDisp)}</Td>
                    <Td tone={r.unrealizedPct >= 0 ? "bull" : "bear"}>{fmtPct(r.unrealizedPct)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

type ConvFn = (amt: number, from: string) => number;
type RowWithNative = Enriched & { _nativeCurrency: string };

function computeTotals(rows: RowWithNative[], convert: ConvFn) {
  let mv = 0, cost = 0, dayChange = 0;
  for (const r of rows) {
    const cur = r._nativeCurrency;
    mv += convert(r.marketValue, cur);
    cost += convert(r.costBasis, cur);
    dayChange += convert(r.dayChange, cur);
  }
  const unrealized = mv - cost;
  return {
    mv, cost, dayChange, unrealized,
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
  data, total, chart, display, formatter,
}: { data: { name: string; value: number }[]; total: number; chart: "pie" | "bar"; display: Display; formatter?: (value: number, name: string) => string }) {
  if (data.length === 0) return <div className="text-muted-foreground text-xs">No data</div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
      <div className="h-48">
        <ResponsiveContainer>
          {chart === "pie" ? (
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={45} outerRadius={80} stroke="var(--color-background)">
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", fontSize: 11 }}
                wrapperStyle={{ color: "var(--color-foreground)" }}
                labelStyle={{ color: "var(--color-foreground)" }}
                itemStyle={{ color: "var(--color-foreground)" }}
                formatter={(v: number) => fmtCurrency(v, display)}
              />
            </PieChart>
          ) : (
            <BarChart data={data}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
              <Tooltip
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", fontSize: 11 }}
                wrapperStyle={{ color: "var(--color-foreground)" }}
                labelStyle={{ color: "var(--color-foreground)" }}
                itemStyle={{ color: "var(--color-foreground)" }}
                formatter={(v: number) => fmtCurrency(v, display)}
              />
              <Bar dataKey="value" fill="var(--color-primary)" />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="space-y-1 text-[12px]">
        {data.map((d, i) => {
          const pct = total ? (d.value / total) * 100 : 0;
          return (
            <div key={d.name} className="flex items-center justify-between border-b border-border/40 py-1">
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

function Stat({
  label, value, sub, tone, accent,
}: { label: string; value: string; sub?: string; tone?: "bull" | "bear"; accent?: boolean }) {
  return (
    <div className={`border border-border bg-card px-4 py-3 ${accent ? "border-l-2 border-l-primary" : ""}`}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-foreground"}`}>
        {value}
      </div>
      {sub && (
        <div className={`text-[11px] ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-muted-foreground"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Panel({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
        <h2 className="text-[10px] uppercase tracking-[0.3em] text-primary">&gt; {title}</h2>
        {actions}
      </div>
      <div className="p-3 md:p-4">{children}</div>
    </section>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2 py-2 font-normal ${className}`}>{children}</th>;
}
function Td({ children, tone }: { children: React.ReactNode; tone?: "bull" | "bear" }) {
  return (
    <td className={`px-2 py-2 text-right tabular-nums ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>
      {children}
    </td>
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
      <p className="mt-2 text-sm text-muted-foreground">Add your first transaction to start tracking live values.</p>
      <Link
        to="/positions"
        className="inline-block mt-6 bg-primary text-primary-foreground px-6 py-2 text-xs uppercase tracking-[0.25em] font-bold hover:opacity-90"
      >
        &gt; ADD TRANSACTION
      </Link>
    </div>
  );
}
