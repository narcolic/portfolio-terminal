import { useState, type ReactNode } from "react";
import type { TransactionInputType } from "@/lib/portfolio/transactions/api";

const ASSET_TYPES = ["stock", "etf", "crypto", "bond", "fund", "other"] as const;
const MARKETS = [
  "NASDAQ",
  "NYSE",
  "LSE",
  "EPA",
  "ETR",
  "TSX",
  "ASX",
  "HKEX",
  "TSE",
  "CRYPTO",
  "OTHER",
];
const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "HKD"];

function Field({
  label,
  children,
  colSpan = 1,
}: {
  label: string;
  children: ReactNode;
  colSpan?: 1 | 2;
}) {
  return (
    <label className={`block ${colSpan === 2 ? "col-span-2" : ""}`}>
      <div className="mb-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </div>
      {children}
    </label>
  );
}

export function TransactionEditor({
  value,
  portfolios,
  onSave,
  onClose,
  busy,
}: {
  value: TransactionInputType & { id?: string };
  portfolios: { id: string; name: string }[];
  onSave: (v: TransactionInputType) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [v, setV] = useState(value);
  const set = <K extends keyof TransactionInputType>(k: K, val: TransactionInputType[K]) => {
    setV((state) => ({ ...state, [k]: val }));
  };

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur md:items-center">
      <div className="w-full max-w-lg border border-border bg-card">
        <div className="flex justify-between border-b border-border bg-secondary/40 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-primary">
          <span>&gt; {value.id ? "EDIT" : "NEW"} TRANSACTION</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            x
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(v);
          }}
          className="grid grid-cols-2 gap-3 p-4"
        >
          <Field label="Date">
            <input
              type="date"
              required
              value={v.transaction_date}
              onChange={(e) => set("transaction_date", e.target.value)}
              className="w-full border border-border bg-input px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </Field>

          <Field label="Ticker">
            <input
              required
              value={v.ticker}
              onChange={(e) => set("ticker", e.target.value.toUpperCase())}
              placeholder="AAPL"
              className="w-full border border-border bg-input px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </Field>

          <Field label="Type">
            <select
              value={v.asset_type}
              onChange={(e) =>
                set("asset_type", e.target.value as TransactionInputType["asset_type"])
              }
              className="w-full border border-border bg-input px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            >
              {ASSET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Currency">
            <select
              value={v.currency}
              onChange={(e) => set("currency", e.target.value)}
              className="w-full border border-border bg-input px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            >
              {CURRENCIES.map((ccy) => (
                <option key={ccy}>{ccy}</option>
              ))}
            </select>
          </Field>

          <Field label="Name" colSpan={2}>
            <input
              value={v.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              className="w-full border border-border bg-input px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </Field>

          <Field label="Portfolio" colSpan={2}>
            <select
              value={v.portfolio_id ?? ""}
              onChange={(e) => set("portfolio_id", e.target.value || null)}
              className="w-full border border-border bg-input px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            >
              <option value="">- Unassigned -</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Market">
            <select
              value={v.market ?? ""}
              onChange={(e) => set("market", e.target.value)}
              className="w-full border border-border bg-input px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            >
              {MARKETS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>

          <Field label="Shares">
            <input
              type="number"
              step="any"
              min="0"
              required
              value={v.shares}
              onChange={(e) => set("shares", Number(e.target.value))}
              className="w-full border border-border bg-input px-2 py-1.5 text-sm tabular-nums focus:border-primary focus:outline-none"
            />
          </Field>

          <Field label="Price / Share">
            <input
              type="number"
              step="any"
              min="0"
              required
              value={v.price}
              onChange={(e) => set("price", Number(e.target.value))}
              className="w-full border border-border bg-input px-2 py-1.5 text-sm tabular-nums focus:border-primary focus:outline-none"
            />
          </Field>

          <Field label="Notes" colSpan={2}>
            <textarea
              rows={2}
              value={v.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              className="w-full border border-border bg-input px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </Field>

          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-border px-4 py-1.5 text-xs uppercase tracking-widest hover:border-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="bg-primary px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
