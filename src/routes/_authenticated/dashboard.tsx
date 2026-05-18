import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listPositions } from "@/lib/positions.functions";
import { listPortfolios } from "@/lib/portfolios.functions";
import { getQuotes } from "@/lib/quotes.functions";
import { enrich, fmt, fmtCurrency, fmtPct, type Enriched, type PositionRow } from "@/lib/portfolio";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type PositionWithPortfolio = PositionRow & { portfolio_id: string | null };

const ALL = "__all__";
const UNASSIGNED = "__unassigned__";

function Dashboard() {
  const list = useServerFn(listPositions);
  const listP = useServerFn(listPortfolios);
  const fetchQuotes = useServerFn(getQuotes);

  const positionsQ = useQuery({
    queryKey: ["positions"],
    queryFn: () => list(),
  });
  const portfoliosQ = useQuery({
    queryKey: ["portfolios"],
    queryFn: () => listP(),
  });

  const [selected, setSelected] = useState<string>(ALL);

  const tickers = useMemo(
    () => Array.from(new Set((positionsQ.data ?? []).map((p) => p.ticker.toUpperCase()))),
    [positionsQ.data],
  );

  const quotesQ = useQuery({
    queryKey: ["quotes", tickers],
    queryFn: () => fetchQuotes({ data: { symbols: tickers } }),
    enabled: tickers.length > 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const allRows = useMemo(
    () => enrich(
      (positionsQ.data ?? []) as PositionWithPortfolio[],
      quotesQ.data?.quotes ?? [],
    ) as (Enriched & { portfolio_id: string | null })[],
    [positionsQ.data, quotesQ.data],
  );

  const rows = useMemo(() => {
    if (selected === ALL) return allRows;
    if (selected === UNASSIGNED) return allRows.filter((r) => !r.portfolio_id);
    return allRows.filter((r) => r.portfolio_id === selected);
  }, [allRows, selected]);

  const portfolioMap = useMemo(
    () => new Map((portfoliosQ.data ?? []).map((p) => [p.id, p.name])),
    [portfoliosQ.data],
  );

  const totals = useMemo(() => computeTotals(rows), [rows]);

  // Per-portfolio breakdown (always against ALL rows, independent of filter)
  const byPortfolio = useMemo(() => {
    const groups = new Map<string, (Enriched & { portfolio_id: string | null })[]>();
    for (const r of allRows) {
      const key = r.portfolio_id ?? UNASSIGNED;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    return Array.from(groups, ([id, items]) => {
      const t = computeTotals(items);
      return {
        id,
        name: id === UNASSIGNED ? "Unassigned" : portfolioMap.get(id) ?? "—",
        count: items.length,
        ...t,
      };
    }).sort((a, b) => b.mv - a.mv);
  }, [allRows, portfolioMap]);

  const byType = useMemo(() => groupSum(rows, (r) => r.asset_type), [rows]);
  const byMarket = useMemo(
    () => groupSum(rows, (r) => r.market || r.quote?.exchange || "—"),
    [rows],
  );

  if (positionsQ.isLoading) return <Skeleton />;

  if ((positionsQ.data ?? []).length === 0) {
    return (
      <EmptyState />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="NET WORTH" value={fmtCurrency(totals.mv)} accent />
        <Stat
          label="DAY P&L"
          value={fmtCurrency(totals.dayChange)}
          sub={fmtPct(totals.dayPct)}
          tone={totals.dayChange >= 0 ? "bull" : "bear"}
        />
        <Stat
          label="UNREALIZED"
          value={fmtCurrency(totals.unrealized)}
          sub={fmtPct(totals.unrealizedPct)}
          tone={totals.unrealized >= 0 ? "bull" : "bear"}
        />
        <Stat label="COST BASIS" value={fmtCurrency(totals.cost)} />
      </div>

      {quotesQ.data?.error && (
        <div className="border border-bear/40 bg-bear/10 px-3 py-2 text-[11px] text-bear uppercase tracking-widest">
          ⚠ {quotesQ.data.error} — showing last known
        </div>
      )}

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="ALLOCATION // BY TYPE">
          <Breakdown data={byType} total={totals.mv} chart="pie" />
        </Panel>
        <Panel title="ALLOCATION // BY MARKET">
          <Breakdown data={byMarket} total={totals.mv} chart="bar" />
        </Panel>
      </div>

      {/* Holdings table */}
      <Panel
        title="HOLDINGS"
        actions={
          <span className="text-[10px] text-muted-foreground">
            {quotesQ.isFetching ? "syncing…" : `${rows.length} positions`}
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr className="border-b border-border">
                <Th className="text-left">Ticker</Th>
                <Th className="text-right">Shares</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Day %</Th>
                <Th className="text-right">Mkt Value</Th>
                <Th className="text-right">Avg Cost</Th>
                <Th className="text-right">Unrealized</Th>
                <Th className="text-right">P&L %</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-secondary/40">
                  <td className="py-2 px-2">
                    <div className="font-bold text-primary">{r.ticker}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                      {r.quote?.shortName || r.name || r.asset_type}
                    </div>
                  </td>
                  <Td>{fmt(r.shares, { maximumFractionDigits: 4 })}</Td>
                  <Td>{fmt(r.price)}</Td>
                  <Td tone={r.dayChangePct >= 0 ? "bull" : "bear"}>
                    {fmtPct(r.dayChangePct)}
                  </Td>
                  <Td>{fmtCurrency(r.marketValue, r.currency)}</Td>
                  <Td>{fmt(r.avg_cost)}</Td>
                  <Td tone={r.unrealized >= 0 ? "bull" : "bear"}>
                    {fmtCurrency(r.unrealized, r.currency)}
                  </Td>
                  <Td tone={r.unrealizedPct >= 0 ? "bull" : "bear"}>
                    {fmtPct(r.unrealizedPct)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function groupSum(rows: Enriched[], key: (r: Enriched) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + r.marketValue);
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
  data, total, chart,
}: { data: { name: string; value: number }[]; total: number; chart: "pie" | "bar" }) {
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
                formatter={(v: number) => fmtCurrency(v)}
              />
            </PieChart>
          ) : (
            <BarChart data={data}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
              <Tooltip
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", fontSize: 11 }}
                formatter={(v: number) => fmtCurrency(v)}
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
                <div>{fmtCurrency(d.value)}</div>
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
      <div className="text-[10px] uppercase tracking-[0.3em] text-primary">// NO POSITIONS</div>
      <h2 className="mt-3 text-2xl">Your portfolio is empty</h2>
      <p className="mt-2 text-sm text-muted-foreground">Add your first holding to start tracking live values.</p>
      <Link
        to="/positions"
        className="inline-block mt-6 bg-primary text-primary-foreground px-6 py-2 text-xs uppercase tracking-[0.25em] font-bold hover:opacity-90"
      >
        &gt; ADD POSITION
      </Link>
    </div>
  );
}
