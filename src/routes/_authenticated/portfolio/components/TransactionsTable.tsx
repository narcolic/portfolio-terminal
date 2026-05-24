import { TerminalTable } from "@/components/terminal/TerminalTable";
import type { Dispatch, SetStateAction } from "react";

type TransactionInputType = import("@/lib/portfolio/transactions/api").TransactionInputType;

type TransactionTableRow = {
  id: string;
  ticker: string;
  name: string | null;
  asset_type: string;
  market: string | null;
  currency: string;
  shares: number;
  price: number;
  transaction_date: string;
  notes: string | null;
  portfolio_id: string | null;
};

export function TransactionsTable({
  data,
  isLoading,
  selected,
  setSelected,
  portfolioName,
  setEditing,
  onDelete,
}: {
  data: TransactionTableRow[];
  isLoading: boolean;
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  portfolioName: (id: string | null) => string;
  setEditing: Dispatch<SetStateAction<(TransactionInputType & { id?: string }) | null>>;
  onDelete: (id: string, ticker: string, transactionDate: string) => void;
}) {
  return (
    <TerminalTable variant="panel">
      <thead className="bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground">
        <tr>
          <th className="px-2 py-2 text-center">
            <input
              type="checkbox"
              checked={data.length > 0 && selected.size === data.length}
              onChange={(e) => {
                if (e.target.checked) setSelected(new Set(data.map((p) => p.id)));
                else setSelected(new Set());
              }}
              className="accent-primary"
            />
          </th>
          <th className="px-3 py-2 text-left">Date</th>
          <th className="px-3 py-2 text-left">Ticker</th>
          <th className="px-3 py-2 text-left">Portfolio</th>
          <th className="px-3 py-2 text-left">Type</th>
          <th className="px-3 py-2 text-left">Market</th>
          <th className="px-3 py-2 text-right">Shares</th>
          <th className="px-3 py-2 text-right">Price</th>
          <th className="px-3 py-2 text-right">Ccy</th>
          <th className="px-3 py-2" />
        </tr>
      </thead>
      <tbody>
        {isLoading && (
          <tr>
            <td colSpan={10} className="p-6 text-center text-muted-foreground">
              Loading...
            </td>
          </tr>
        )}
        {!isLoading && data.length === 0 && (
          <tr>
            <td colSpan={10} className="p-6 text-center text-muted-foreground">
              No transactions yet
            </td>
          </tr>
        )}
        {data.map((position) => (
          <tr key={position.id} className="border-t border-border/60 hover:bg-secondary/30">
            <td className="px-2 py-2 text-center">
              <input
                type="checkbox"
                checked={selected.has(position.id)}
                onChange={(e) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(position.id);
                    else next.delete(position.id);
                    return next;
                  });
                }}
                className="accent-primary"
              />
            </td>
            <td className="px-3 py-2 text-[11px] tabular-nums">{position.transaction_date}</td>
            <td className="px-3 py-2 font-bold text-primary">{position.ticker}</td>
            <td className="px-3 py-2 text-[11px]">{portfolioName(position.portfolio_id)}</td>
            <td className="px-3 py-2 text-[11px] uppercase">{position.asset_type}</td>
            <td className="px-3 py-2 text-[11px]">{position.market || "-"}</td>
            <td className="px-3 py-2 text-right tabular-nums">{Number(position.shares)}</td>
            <td className="px-3 py-2 text-right tabular-nums">
              {Number(position.price).toFixed(2)}
            </td>
            <td className="px-3 py-2 text-[11px]">{position.currency}</td>
            <td className="px-3 py-2 text-right whitespace-nowrap">
              <button
                onClick={() =>
                  setEditing({
                    id: position.id,
                    ticker: position.ticker,
                    name: position.name ?? "",
                    asset_type: position.asset_type as TransactionInputType["asset_type"],
                    market: position.market ?? "",
                    currency: position.currency,
                    shares: Number(position.shares),
                    price: Number(position.price),
                    transaction_date: position.transaction_date,
                    notes: position.notes ?? "",
                    portfolio_id: position.portfolio_id ?? null,
                  })
                }
                className="mr-3 text-[11px] uppercase text-primary hover:underline"
              >
                edit
              </button>
              <button
                onClick={() => onDelete(position.id, position.ticker, position.transaction_date)}
                className="text-[11px] uppercase text-bear hover:underline"
              >
                del
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </TerminalTable>
  );
}
