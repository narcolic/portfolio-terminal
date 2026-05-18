import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listPositions, createPosition, updatePosition, deletePosition, bulkDeletePositions,
  bulkImportPositions, type TransactionInputType,
} from "@/lib/positions.functions";
import {
  listPortfolios, createPortfolio, deletePortfolio, type PortfolioInputType,
} from "@/lib/portfolios.functions";
import { parseCSV, mapCsvRows } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/positions")({
  component: TransactionsPage,
});

const ASSET_TYPES = ["stock", "etf", "crypto", "bond", "fund", "other"] as const;
const MARKETS = ["NASDAQ", "NYSE", "LSE", "EPA", "ETR", "TSX", "ASX", "HKEX", "TSE", "CRYPTO", "OTHER"];
const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "HKD"];

const today = () => new Date().toISOString().slice(0, 10);

const empty = (): TransactionInputType => ({
  ticker: "", name: "", asset_type: "stock",
  market: "NASDAQ", currency: "USD",
  shares: 0, price: 0, transaction_date: today(),
  notes: "", portfolio_id: null,
});

function TransactionsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listPositions);
  const create = useServerFn(createPosition);
  const update = useServerFn(updatePosition);
  const del = useServerFn(deletePosition);
  const bulkDel = useServerFn(bulkDeletePositions);
  const bulk = useServerFn(bulkImportPositions);
  const listP = useServerFn(listPortfolios);
  const createP = useServerFn(createPortfolio);
  const delP = useServerFn(deletePortfolio);

  const { data = [], isLoading } = useQuery({ queryKey: ["positions"], queryFn: () => list() });
  const { data: portfolios = [] } = useQuery({ queryKey: ["portfolios"], queryFn: () => listP() });

  const [editing, setEditing] = useState<(TransactionInputType & { id?: string }) | null>(null);
  const [showPortfolios, setShowPortfolios] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const portfolioName = useMemo(() => {
    const m = new Map(portfolios.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "Unassigned");
  }, [portfolios]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["positions"] });
    qc.invalidateQueries({ queryKey: ["portfolios"] });
  };

  const createM = useMutation({
    mutationFn: (v: TransactionInputType) => create({ data: v }),
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Transaction added"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: (v: TransactionInputType & { id: string }) => update({ data: v }),
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Updated"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Removed"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const bulkDeleteM = useMutation({
    mutationFn: (ids: string[]) => bulkDel({ data: { ids } }),
    onSuccess: (r) => { invalidate(); setSelected(new Set()); toast.success(`Deleted ${r.deleted} transactions`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const importM = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const parsed = parseCSV(text);
      const { rows, errors } = mapCsvRows(parsed);
      if (errors.length) errors.slice(0, 3).forEach((e) => toast.error(e));
      if (!rows.length) throw new Error("No valid rows to import");

      const nameToId = new Map(portfolios.map((p) => [p.name.toLowerCase(), p.id]));
      const newNames = Array.from(new Set(
        rows.map((r) => r.portfolio?.trim()).filter((n): n is string => !!n && !nameToId.has(n.toLowerCase()))
      ));
      for (const n of newNames) {
        const p = await createP({ data: { name: n } });
        nameToId.set(n.toLowerCase(), p.id);
      }

      const payload: TransactionInputType[] = rows.map((r) => ({
        ticker: r.ticker,
        name: r.name ?? null,
        asset_type: (ASSET_TYPES as readonly string[]).includes(r.asset_type ?? "")
          ? (r.asset_type as TransactionInputType["asset_type"])
          : "stock",
        market: r.market ?? null,
        currency: r.currency ?? "USD",
        shares: r.shares,
        price: r.price,
        transaction_date: r.transaction_date,
        notes: r.notes ?? null,
        portfolio_id: r.portfolio ? nameToId.get(r.portfolio.toLowerCase()) ?? null : null,
      }));

      return bulk({ data: { rows: payload } });
    },
    onSuccess: (r) => { invalidate(); toast.success(`Imported ${r.inserted} transactions`); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl uppercase tracking-[0.2em]">&gt; TRANSACTIONS</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Each row is a single buy. Average cost per holding is computed automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowPortfolios(true)}
            className="border border-border px-3 py-2 text-[11px] uppercase tracking-[0.2em] hover:border-primary"
          >
            ▣ Portfolios ({portfolios.length})
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importM.mutate(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importM.isPending}
            className="border border-border px-3 py-2 text-[11px] uppercase tracking-[0.2em] hover:border-primary disabled:opacity-50"
          >
            {importM.isPending ? "Importing…" : "↑ Upload CSV"}
          </button>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(
              `transaction_date,ticker,name,asset_type,market,currency,shares,price,portfolio,notes\n` +
              `2024-01-15,AAPL,Apple Inc.,stock,NASDAQ,USD,10,150.20,IBKR,initial buy\n` +
              `2024-06-03,AAPL,Apple Inc.,stock,NASDAQ,USD,5,185.40,IBKR,add\n` +
              `2024-03-10,AIR.PA,Airbus SE,stock,EPA,EUR,5,128.40,Degiro,\n` +
              `2024-02-20,VOD.L,Vodafone,stock,LSE,GBP,100,0.75,IBKR,\n` +
              `2023-11-01,BTC-USD,Bitcoin,crypto,CRYPTO,USD,0.5,35000,Coinbase,long term\n` +
              `2024-08-12,BTC-USD,Bitcoin,crypto,CRYPTO,USD,0.25,58000,Coinbase,DCA\n`
            )}`}
            download="transactions-template.csv"
            className="border border-border px-3 py-2 text-[11px] uppercase tracking-[0.2em] hover:border-primary"
          >
            ↓ Template
          </a>
          <button
            onClick={() => setEditing(empty())}
            className="bg-primary text-primary-foreground px-4 py-2 text-xs uppercase tracking-[0.2em] font-bold hover:opacity-90"
          >
            + NEW
          </button>
        </div>
      </div>

      <details className="border border-border bg-card/50 text-[11px]">
        <summary className="cursor-pointer px-3 py-2 uppercase tracking-[0.2em] text-muted-foreground hover:text-primary">
          CSV format help
        </summary>
        <div className="px-3 pb-3 text-muted-foreground space-y-1">
          <p><strong className="text-foreground">Required columns:</strong> <code className="text-primary">ticker</code>, <code className="text-primary">shares</code>, <code className="text-primary">price</code>.</p>
          <p><strong className="text-foreground">Optional:</strong> <code>transaction_date</code> (YYYY-MM-DD, defaults to today), <code>name</code>, <code>asset_type</code> (stock/etf/crypto/bond/fund/other), <code>market</code>, <code>currency</code>, <code>portfolio</code>, <code>notes</code>.</p>
          <p><strong className="text-foreground">Multiple buys?</strong> Just add multiple rows for the same ticker — average cost is computed automatically.</p>
          <p><strong className="text-foreground">Tickers:</strong> use Yahoo Finance symbols — <code>AAPL</code>, <code>AIR.PA</code>, <code>VOD.L</code>, <code>BTC-USD</code>.</p>
          <p>Aliases: symbol→ticker, qty/quantity→shares, cost/avg_cost/buy price→price, date/trade date→transaction_date, broker/account/platform→portfolio.</p>
          <pre className="mt-2 bg-background border border-border p-2 overflow-x-auto">{`transaction_date,ticker,asset_type,currency,shares,price,portfolio
2024-01-15,AAPL,stock,USD,10,150.20,IBKR
2024-06-03,AAPL,stock,USD,5,185.40,IBKR
2024-03-10,AIR.PA,stock,EUR,5,128.40,Degiro
2023-11-01,BTC-USD,crypto,USD,0.5,35000,Coinbase`}</pre>
        </div>
      </details>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 border border-bear/30 bg-bear/5 px-3 py-2 text-[11px]">
          <span className="uppercase tracking-widest text-bear font-bold">{selected.size} selected</span>
          <button
            onClick={() => {
              if (confirm(`Delete ${selected.size} transactions?`)) bulkDeleteM.mutate(Array.from(selected));
            }}
            disabled={bulkDeleteM.isPending}
            className="border border-bear px-3 py-1 text-[10px] uppercase tracking-widest text-bear hover:bg-bear hover:text-white disabled:opacity-50"
          >
            {bulkDeleteM.isPending ? "Deleting…" : "Delete selected"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-muted-foreground hover:text-foreground uppercase tracking-widest text-[10px]"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="border border-border bg-card overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-secondary/40">
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
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Ticker</th>
              <th className="text-left px-3 py-2">Portfolio</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Market</th>
              <th className="text-right px-3 py-2">Shares</th>
              <th className="text-right px-3 py-2">Price</th>
              <th className="text-right px-3 py-2">Ccy</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && data.length === 0 && (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No transactions yet</td></tr>
            )}
            {data.map((p) => (
              <tr key={p.id} className="border-t border-border/60 hover:bg-secondary/30">
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        return next;
                      });
                    }}
                    className="accent-primary"
                  />
                </td>
                <td className="px-3 py-2 text-[11px] tabular-nums">{p.transaction_date}</td>
                <td className="px-3 py-2 font-bold text-primary">{p.ticker}</td>
                <td className="px-3 py-2 text-[11px]">{portfolioName(p.portfolio_id)}</td>
                <td className="px-3 py-2 uppercase text-[11px]">{p.asset_type}</td>
                <td className="px-3 py-2 text-[11px]">{p.market || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(p.shares)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(p.price).toFixed(2)}</td>
                <td className="px-3 py-2 text-[11px]">{p.currency}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => setEditing({
                      id: p.id, ticker: p.ticker, name: p.name ?? "",
                      asset_type: p.asset_type as TransactionInputType["asset_type"],
                      market: p.market ?? "", currency: p.currency,
                      shares: Number(p.shares), price: Number(p.price),
                      transaction_date: p.transaction_date,
                      notes: p.notes ?? "",
                      portfolio_id: p.portfolio_id ?? null,
                    })}
                    className="text-primary text-[11px] uppercase mr-3 hover:underline"
                  >edit</button>
                  <button
                    onClick={() => { if (confirm(`Delete transaction for ${p.ticker} on ${p.transaction_date}?`)) deleteM.mutate(p.id); }}
                    className="text-bear text-[11px] uppercase hover:underline"
                  >del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal
          value={editing}
          portfolios={portfolios}
          onClose={() => setEditing(null)}
          busy={createM.isPending || updateM.isPending}
          onSave={(v) => {
            if (editing.id) updateM.mutate({ ...v, id: editing.id });
            else createM.mutate(v);
          }}
        />
      )}

      {showPortfolios && (
        <PortfoliosModal
          portfolios={portfolios}
          onClose={() => setShowPortfolios(false)}
          onCreate={async (v) => {
            try {
              await createP({ data: v });
              qc.invalidateQueries({ queryKey: ["portfolios"] });
              toast.success("Portfolio added");
            } catch (e) { toast.error((e as Error).message); }
          }}
          onDelete={async (id) => {
            try {
              await delP({ data: { id } });
              qc.invalidateQueries({ queryKey: ["portfolios"] });
              qc.invalidateQueries({ queryKey: ["positions"] });
              toast.success("Portfolio removed");
            } catch (e) { toast.error((e as Error).message); }
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  value, portfolios, onSave, onClose, busy,
}: {
  value: TransactionInputType & { id?: string };
  portfolios: { id: string; name: string }[];
  onSave: (v: TransactionInputType) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [v, setV] = useState(value);
  const set = <K extends keyof TransactionInputType>(k: K, val: TransactionInputType[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  return (
    <div className="fixed inset-0 z-20 bg-background/80 backdrop-blur flex items-start md:items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg border border-border bg-card">
        <div className="border-b border-border bg-secondary/40 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-primary flex justify-between">
          <span>&gt; {value.id ? "EDIT" : "NEW"} TRANSACTION</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSave(v); }}
          className="p-4 grid grid-cols-2 gap-3"
        >
          <Field label="Date">
            <input
              type="date" required value={v.transaction_date}
              onChange={(e) => set("transaction_date", e.target.value)}
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Ticker">
            <input
              required value={v.ticker}
              onChange={(e) => set("ticker", e.target.value.toUpperCase())}
              placeholder="AAPL"
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Type">
            <select value={v.asset_type} onChange={(e) => set("asset_type", e.target.value as TransactionInputType["asset_type"])}
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary">
              {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Currency">
            <select value={v.currency} onChange={(e) => set("currency", e.target.value)}
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Name" colSpan={2}>
            <input
              value={v.name ?? ""} onChange={(e) => set("name", e.target.value)}
              placeholder="Apple Inc. (optional, fallback to Yahoo)"
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Portfolio" colSpan={2}>
            <select
              value={v.portfolio_id ?? ""}
              onChange={(e) => set("portfolio_id", e.target.value || null)}
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">— Unassigned —</option>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Market">
            <select value={v.market ?? ""} onChange={(e) => set("market", e.target.value)}
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary">
              {MARKETS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Shares">
            <input
              type="number" step="any" min="0" required value={v.shares}
              onChange={(e) => set("shares", Number(e.target.value))}
              className="w-full bg-input border border-border px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Price / Share">
            <input
              type="number" step="any" min="0" required value={v.price}
              onChange={(e) => set("price", Number(e.target.value))}
              className="w-full bg-input border border-border px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Notes" colSpan={2}>
            <textarea
              rows={2} value={v.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
          </Field>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="border border-border px-4 py-1.5 text-xs uppercase tracking-widest hover:border-primary">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="bg-primary text-primary-foreground px-4 py-1.5 text-xs uppercase tracking-widest font-bold disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PortfoliosModal({
  portfolios, onClose, onCreate, onDelete,
}: {
  portfolios: { id: string; name: string; broker: string | null }[];
  onClose: () => void;
  onCreate: (v: PortfolioInputType) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [broker, setBroker] = useState("");

  return (
    <div className="fixed inset-0 z-20 bg-background/80 backdrop-blur flex items-start md:items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md border border-border bg-card">
        <div className="border-b border-border bg-secondary/40 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-primary flex justify-between">
          <span>&gt; PORTFOLIOS</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Portfolios are multi-currency. Currency is set per transaction.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              await onCreate({ name: name.trim(), broker: broker.trim() || null });
              setName(""); setBroker("");
            }}
            className="grid grid-cols-2 gap-2"
          >
            <input
              value={name} onChange={(e) => setName(e.target.value)} required
              placeholder="Name (e.g. IBKR)"
              className="col-span-2 bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
            <input
              value={broker} onChange={(e) => setBroker(e.target.value)}
              placeholder="Broker (optional)"
              className="col-span-2 bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="col-span-2 bg-primary text-primary-foreground px-3 py-1.5 text-xs uppercase tracking-[0.2em] font-bold hover:opacity-90"
            >
              + Add Portfolio
            </button>
          </form>

          <div className="border border-border">
            {portfolios.length === 0 && (
              <div className="p-3 text-center text-[11px] text-muted-foreground">No portfolios yet</div>
            )}
            {portfolios.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-t first:border-t-0 border-border/60 px-3 py-2 text-[12px]">
                <div>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                    {p.broker || "—"}
                  </div>
                </div>
                <button
                  onClick={() => { if (confirm(`Delete portfolio "${p.name}"? Transactions will become unassigned.`)) onDelete(p.id); }}
                  className="text-bear text-[10px] uppercase hover:underline"
                >del</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, children, colSpan = 1,
}: { label: string; children: React.ReactNode; colSpan?: 1 | 2 }) {
  return (
    <label className={`block ${colSpan === 2 ? "col-span-2" : ""}`}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
