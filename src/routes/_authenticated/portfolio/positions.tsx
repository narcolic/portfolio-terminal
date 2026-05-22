import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TerminalTable } from "@/components/terminal/TerminalTable";
import { mapCsvRows, parseCSV } from "@/lib/csv";
import { type PortfolioInputType } from "@/lib/portfolio/portfolios.functions";
import { type TransactionInputType } from "@/lib/portfolio/positions.functions";

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

const today = () => new Date().toISOString().slice(0, 10);

const empty = (): TransactionInputType => ({
  ticker: "",
  name: "",
  asset_type: "stock",
  market: "NASDAQ",
  currency: "USD",
  shares: 0,
  price: 0,
  transaction_date: today(),
  notes: "",
  portfolio_id: null,
});

type PositionRow = {
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

type PortfolioRow = {
  id: string;
  name: string;
  broker: string | null;
  notes: string | null;
};

function TransactionsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<(TransactionInputType & { id?: string }) | null>(null);
  const [showPortfolios, setShowPortfolios] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data = [], isLoading } = useQuery<PositionRow[]>({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("transactions")
        .select("*")
        .order("transaction_date", { ascending: false });

      if (error) throw new Error(error.message);
      return (rows ?? []) as PositionRow[];
    },
  });

  const { data: portfolios = [] } = useQuery<PortfolioRow[]>({
    queryKey: ["portfolios"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("portfolios")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);
      return (rows ?? []) as PortfolioRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["positions"] });
    qc.invalidateQueries({ queryKey: ["portfolios"] });
  };

  const getCurrentUserId = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    const userId = data.user?.id;
    if (!userId) throw new Error("You must be logged in to perform this action");
    return userId;
  };

  const portfolioName = useMemo(() => {
    const map = new Map(portfolios.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "-") : "Unassigned");
  }, [portfolios]);

  const createM = useMutation({
    mutationFn: async (value: TransactionInputType) => {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from("transactions").insert([{ ...value, user_id: userId }]);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Transaction added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateM = useMutation({
    mutationFn: async (value: TransactionInputType & { id: string }) => {
      const { id, ...rest } = value;
      const { error } = await supabase.from("transactions").update(rest).eq("id", id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDeleteM = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("transactions").delete().in("id", ids);
      if (error) throw new Error(error.message);
      return { deleted: ids.length };
    },
    onSuccess: (result) => {
      invalidate();
      setSelected(new Set());
      toast.success(`Deleted ${result.deleted} transactions`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createP = useMutation({
    mutationFn: async (value: PortfolioInputType) => {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from("portfolios").insert([{ ...value, user_id: userId }]);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Portfolio added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delP = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portfolios").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Portfolio removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importM = useMutation({
    mutationFn: async (file: File) => {
      const userId = await getCurrentUserId();
      const text = await file.text();
      const parsed = parseCSV(text);
      const { rows, errors } = mapCsvRows(parsed);

      if (errors.length > 0) {
        errors.slice(0, 3).forEach((error) => toast.error(error));
      }
      if (rows.length === 0) {
        throw new Error("No valid rows to import");
      }

      // Build a name -> id lookup from user's existing portfolios.
      const { data: userPortfolios, error: pfError } = await supabase
        .from("portfolios")
        .select("id,name")
        .eq("user_id", userId);
      if (pfError) throw new Error(pfError.message);

      const portfolioIdByName = new Map<string, string>();
      for (const p of userPortfolios ?? []) {
        if (p.name) portfolioIdByName.set(p.name.trim().toLowerCase(), p.id);
      }

      // Ensure portfolios from CSV exist so each row can map to its intended portfolio.
      const csvPortfolioNames = Array.from(
        new Set(
          rows.map((row) => row.portfolio?.trim()).filter((name): name is string => Boolean(name)),
        ),
      );

      for (const portfolioName of csvPortfolioNames) {
        const key = portfolioName.toLowerCase();
        if (portfolioIdByName.has(key)) continue;

        const { data: created, error: createPfError } = await supabase
          .from("portfolios")
          .insert([
            {
              name: portfolioName,
              broker: portfolioName,
              notes: "Imported via CSV",
              user_id: userId,
            },
          ])
          .select("id,name")
          .single();
        if (createPfError) throw new Error(createPfError.message);
        portfolioIdByName.set(key, created.id);
      }

      const payload = rows.map((row) => {
        const portfolioName = row.portfolio?.trim();
        const portfolioId = portfolioName
          ? (portfolioIdByName.get(portfolioName.toLowerCase()) ?? null)
          : null;

        return {
          ticker: row.ticker,
          name: row.name ?? null,
          asset_type: (ASSET_TYPES as readonly string[]).includes(row.asset_type ?? "")
            ? (row.asset_type as TransactionInputType["asset_type"])
            : "stock",
          market: row.market ?? null,
          currency: row.currency ?? "USD",
          shares: row.shares,
          price: row.price,
          transaction_date: row.transaction_date,
          notes: row.notes ?? null,
          portfolio_id: portfolioId,
          user_id: userId,
        };
      });

      const { error } = await supabase.from("transactions").insert(payload);
      if (error) throw new Error(error.message);
      return { inserted: payload.length };
    },
    onSuccess: (result) => {
      invalidate();
      toast.success(`Imported ${result.inserted} transactions`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl uppercase tracking-[0.2em]">&gt; TRANSACTIONS</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Each row is a single buy. Average cost per holding is computed automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowPortfolios(true)}
            className="border border-border px-3 py-2 text-[11px] uppercase tracking-[0.2em] hover:border-primary"
          >
            Portfolios ({portfolios.length})
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importM.mutate(file);
              e.target.value = "";
            }}
          />

          <button
            onClick={() => fileRef.current?.click()}
            disabled={importM.isPending}
            className="border border-border px-3 py-2 text-[11px] uppercase tracking-[0.2em] hover:border-primary disabled:opacity-50"
          >
            {importM.isPending ? "Importing..." : "Upload CSV"}
          </button>

          <button
            onClick={() => setEditing(empty())}
            className="bg-primary px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground hover:opacity-90"
          >
            New
          </button>
        </div>
      </div>

      <details className="border border-border bg-card/50 text-[11px]">
        <summary className="cursor-pointer px-3 py-2 uppercase tracking-[0.2em] text-muted-foreground hover:text-primary">
          CSV format help
        </summary>
        <div className="space-y-1 px-3 pb-3 text-muted-foreground">
          <p>
            <strong className="text-foreground">Required columns:</strong> ticker, shares, price.
          </p>
          <p>
            <strong className="text-foreground">Optional:</strong> transaction_date, portfolio,
            asset_type, market, currency, notes.
          </p>
          <p>
            <strong className="text-foreground">Tickers:</strong> AAPL, AIR.PA, VOD.L, BTC-USD.
          </p>
          <pre className="mt-2 overflow-x-auto border border-border bg-background p-2">
            {`transaction_date,ticker,asset_type,currency,shares,price,portfolio
2024-01-15,AAPL,stock,USD,10,150.20,IBKR
2024-06-03,AAPL,stock,USD,5,185.40,IBKR
2024-03-10,AIR.PA,stock,EUR,5,128.40,Degiro
2023-11-01,BTC-USD,crypto,USD,0.5,35000,Coinbase`}
          </pre>
        </div>
      </details>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 border border-bear/30 bg-bear/5 px-3 py-2 text-[11px]">
          <span className="font-bold uppercase tracking-widest text-bear">
            {selected.size} selected
          </span>
          <button
            onClick={() => {
              if (confirm(`Delete ${selected.size} transactions?`)) {
                bulkDeleteM.mutate(Array.from(selected));
              }
            }}
            disabled={bulkDeleteM.isPending}
            className="border border-bear px-3 py-1 text-[10px] uppercase tracking-widest text-bear hover:bg-bear hover:text-white disabled:opacity-50"
          >
            {bulkDeleteM.isPending ? "Deleting..." : "Delete selected"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

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
                  onClick={() => {
                    if (
                      confirm(
                        `Delete transaction for ${position.ticker} on ${position.transaction_date}?`,
                      )
                    ) {
                      deleteM.mutate(position.id);
                    }
                  }}
                  className="text-[11px] uppercase text-bear hover:underline"
                >
                  del
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </TerminalTable>

      {editing && (
        <EditModal
          value={editing}
          portfolios={portfolios}
          onClose={() => setEditing(null)}
          busy={createM.isPending || updateM.isPending}
          onSave={(value) => {
            if (editing.id) updateM.mutate({ ...value, id: editing.id });
            else createM.mutate(value);
          }}
        />
      )}

      {showPortfolios && (
        <PortfoliosModal
          portfolios={portfolios}
          onClose={() => setShowPortfolios(false)}
          onCreate={async (value) => {
            try {
              await createP.mutateAsync(value);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
          onDelete={async (id) => {
            try {
              await delP.mutateAsync(id);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}

function EditModal({
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

function PortfoliosModal({
  portfolios,
  onClose,
  onCreate,
  onDelete,
}: {
  portfolios: PortfolioRow[];
  onClose: () => void;
  onCreate: (v: PortfolioInputType) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [broker, setBroker] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur md:items-center">
      <div className="w-full max-w-md border border-border bg-card">
        <div className="flex justify-between border-b border-border bg-secondary/40 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-primary">
          <span>&gt; PORTFOLIOS</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            x
          </button>
        </div>

        <div className="space-y-4 p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              await onCreate({
                name: name.trim(),
                broker: broker.trim() || null,
                notes: notes.trim() || null,
              });
              setName("");
              setBroker("");
              setNotes("");
            }}
            className="grid grid-cols-2 gap-2"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Name (e.g. Main Portfolio)"
              className="col-span-2 border border-border bg-input px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
            <input
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              placeholder="Broker (optional)"
              className="col-span-2 border border-border bg-input px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="col-span-2 border border-border bg-input px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              className="col-span-2 bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground hover:opacity-90"
            >
              Add Portfolio
            </button>
          </form>

          <div className="border border-border">
            {portfolios.length === 0 && (
              <div className="p-3 text-center text-[11px] text-muted-foreground">
                No portfolios yet
              </div>
            )}
            {portfolios.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-[12px] first:border-t-0"
              >
                <div>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">Broker: {p.broker || "-"}</div>
                  <div className="text-[10px] text-muted-foreground">Notes: {p.notes || "-"}</div>
                </div>
                <button
                  onClick={() => {
                    if (
                      confirm(`Delete portfolio "${p.name}"? Transactions will become unassigned.`)
                    ) {
                      onDelete(p.id);
                    }
                  }}
                  className="text-[10px] uppercase text-bear hover:underline"
                >
                  del
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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

export const Route = createFileRoute("/_authenticated/portfolio/positions")({
  component: TransactionsPage,
});
