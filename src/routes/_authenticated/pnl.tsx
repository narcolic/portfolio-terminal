import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getQuotesClient } from "@/lib/quotes.functions";
import {
  aggregateTransactions,
  enrich,
  fmt,
  fmtCurrency,
  fmtPct,
  type TransactionRow,
} from "@/lib/portfolio";

export const Route = createFileRoute("/_authenticated/pnl")({
  component: PnL,
});

function PnL() {
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
  });

  const rows = useMemo(
    () => enrich(positions, quotesQ.data?.quotes ?? []).sort((a, b) => b.unrealized - a.unrealized),
    [positions, quotesQ.data],
  );

  const gainers = rows.filter((r) => r.unrealized >= 0);
  const losers = rows.filter((r) => r.unrealized < 0).reverse();
  const totalGain = gainers.reduce((s, r) => s + r.unrealized, 0);
  const totalLoss = losers.reduce((s, r) => s + r.unrealized, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl uppercase tracking-[0.2em]">&gt; GAIN / LOSS</h1>
        <button
          className="border border-border bg-card px-4 text-[11px] uppercase tracking-[0.2em] hover:text-primary disabled:opacity-50"
          disabled={tickers.length === 0}
          onClick={() => quotesQ.refetch()}
        >
          sync
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Bucket title="GAINERS" tone="bull" total={totalGain} rows={gainers} />
        <Bucket title="LOSERS" tone="bear" total={totalLoss} rows={losers} />
      </div>
    </div>
  );
}

function Bucket({
  title,
  tone,
  total,
  rows,
}: {
  title: string;
  tone: "bull" | "bear";
  total: number;
  rows: ReturnType<typeof enrich>;
}) {
  return (
    <section className="border border-border bg-card">
      <div
        className={`border-b border-border px-3 py-2 flex justify-between items-center ${tone === "bull" ? "bg-bull/10" : "bg-bear/10"}`}
      >
        <h2
          className={`text-[11px] uppercase tracking-[0.3em] ${tone === "bull" ? "text-bull" : "text-bear"}`}
        >
          &gt; {title} ({rows.length})
        </h2>
        <span
          className={`text-sm font-bold tabular-nums ${tone === "bull" ? "text-bull" : "text-bear"}`}
        >
          {fmtCurrency(total)}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">Nothing here. Good.</div>
      ) : (
        <table className="w-full text-[12px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60">
                <td className="px-3 py-2">
                  <div className="font-bold text-primary">{r.ticker}</div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                    {r.quote?.shortName || r.name}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[11px] text-muted-foreground">
                  {fmt(r.shares, { maximumFractionDigits: 4 })} @ {fmt(r.avg_cost)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums font-bold ${tone === "bull" ? "text-bull" : "text-bear"}`}
                >
                  <div>{fmtCurrency(r.unrealized, r.currency)}</div>
                  <div className="text-[10px]">{fmtPct(r.unrealizedPct)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
