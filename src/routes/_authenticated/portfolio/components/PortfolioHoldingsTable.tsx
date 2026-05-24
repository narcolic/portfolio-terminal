import { TerminalCard } from "@/components/terminal/TerminalCard";
import { TerminalTable, TerminalTd, TerminalTh } from "@/components/terminal/TerminalTable";
import { fmt, fmtCurrency, fmtPct } from "@/lib/portfolio/formatters";
import type { Enriched } from "@/lib/portfolio/types";

type RowWithNative = Enriched & { _nativeCurrency: string };

export function PortfolioHoldingsTable({
  rows,
  display,
  convert,
  formatDisplayCurrency,
}: {
  rows: RowWithNative[];
  display: string;
  convert: (amount: number, from: string) => number;
  formatDisplayCurrency: (n: number) => string;
}) {
  return (
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
                  <TerminalTd>{formatDisplayCurrency(mvDisp)}</TerminalTd>
                  <TerminalTd>{r.tx_count}</TerminalTd>
                  <TerminalTd tone={r.unrealized >= 0 ? "bull" : "bear"}>
                    {formatDisplayCurrency(unrealDisp)}
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
  );
}
