import { StatCard } from "@/components/terminal/StatCard";
import { fmtPct } from "@/lib/portfolio/formatters";

type Totals = {
  mv: number;
  cost: number;
  dayChange: number;
  unrealized: number;
  dayPct: number;
  unrealizedPct: number;
};

export function PortfolioSummary({
  selectedAll,
  display,
  totals,
  formatCurrency,
}: {
  selectedAll: boolean;
  display: string;
  totals: Totals;
  formatCurrency: (value: number) => string;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label={selectedAll ? `NET WORTH (${display})` : `PORTFOLIO VALUE (${display})`}
        value={formatCurrency(totals.mv)}
        accent
      />
      <StatCard
        label="DAY P&L"
        value={formatCurrency(totals.dayChange)}
        sub={fmtPct(totals.dayPct)}
        tone={totals.dayChange >= 0 ? "bull" : "bear"}
      />
      <StatCard
        label="UNREALIZED"
        value={formatCurrency(totals.unrealized)}
        sub={fmtPct(totals.unrealizedPct)}
        tone={totals.unrealized >= 0 ? "bull" : "bear"}
      />
      <StatCard label="COST BASIS" value={formatCurrency(totals.cost)} />
    </div>
  );
}
