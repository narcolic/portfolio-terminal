import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listPositions, createPosition, updatePosition, deletePosition,
  type PositionInputType,
} from "@/lib/positions.functions";

export const Route = createFileRoute("/_authenticated/positions")({
  component: PositionsPage,
});

const ASSET_TYPES = ["stock", "etf", "crypto", "bond", "fund", "other"] as const;
const MARKETS = ["NASDAQ", "NYSE", "LSE", "EPA", "ETR", "TSX", "ASX", "HKEX", "TSE", "CRYPTO", "OTHER"];
const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "HKD"];

const empty: PositionInputType = {
  ticker: "", name: "", asset_type: "stock",
  market: "NASDAQ", currency: "USD", shares: 0, avg_cost: 0, notes: "",
};

function PositionsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listPositions);
  const create = useServerFn(createPosition);
  const update = useServerFn(updatePosition);
  const del = useServerFn(deletePosition);

  const { data = [], isLoading } = useQuery({ queryKey: ["positions"], queryFn: () => list() });

  const [editing, setEditing] = useState<(PositionInputType & { id?: string }) | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["positions"] });

  const createM = useMutation({
    mutationFn: (v: PositionInputType) => create({ data: v }),
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Position added"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: (v: PositionInputType & { id: string }) => update({ data: v }),
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Updated"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl uppercase tracking-[0.2em]">&gt; POSITIONS</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Use Yahoo Finance tickers (e.g. AAPL, MSFT, BTC-USD, AIR.PA, VOD.L)
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...empty })}
          className="bg-primary text-primary-foreground px-4 py-2 text-xs uppercase tracking-[0.2em] font-bold hover:opacity-90"
        >
          + NEW
        </button>
      </div>

      <div className="border border-border bg-card overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase tracking-widest text-muted-foreground bg-secondary/40">
            <tr>
              <th className="text-left px-3 py-2">Ticker</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Market</th>
              <th className="text-right px-3 py-2">Shares</th>
              <th className="text-right px-3 py-2">Avg Cost</th>
              <th className="text-right px-3 py-2">Ccy</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && data.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No positions yet</td></tr>
            )}
            {data.map((p) => (
              <tr key={p.id} className="border-t border-border/60 hover:bg-secondary/30">
                <td className="px-3 py-2 font-bold text-primary">{p.ticker}</td>
                <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{p.name || "—"}</td>
                <td className="px-3 py-2 uppercase text-[11px]">{p.asset_type}</td>
                <td className="px-3 py-2 text-[11px]">{p.market || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(p.shares)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(p.avg_cost).toFixed(2)}</td>
                <td className="px-3 py-2 text-[11px]">{p.currency}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => setEditing({
                      id: p.id, ticker: p.ticker, name: p.name ?? "",
                      asset_type: p.asset_type as PositionInputType["asset_type"],
                      market: p.market ?? "", currency: p.currency,
                      shares: Number(p.shares), avg_cost: Number(p.avg_cost),
                      notes: p.notes ?? "",
                    })}
                    className="text-primary text-[11px] uppercase mr-3 hover:underline"
                  >edit</button>
                  <button
                    onClick={() => { if (confirm(`Delete ${p.ticker}?`)) deleteM.mutate(p.id); }}
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
          onClose={() => setEditing(null)}
          busy={createM.isPending || updateM.isPending}
          onSave={(v) => {
            if (editing.id) updateM.mutate({ ...v, id: editing.id });
            else createM.mutate(v);
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  value, onSave, onClose, busy,
}: {
  value: PositionInputType & { id?: string };
  onSave: (v: PositionInputType) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [v, setV] = useState(value);
  const set = <K extends keyof PositionInputType>(k: K, val: PositionInputType[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  return (
    <div className="fixed inset-0 z-20 bg-background/80 backdrop-blur flex items-start md:items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg border border-border bg-card">
        <div className="border-b border-border bg-secondary/40 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-primary flex justify-between">
          <span>&gt; {value.id ? "EDIT" : "NEW"} POSITION</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSave(v); }}
          className="p-4 grid grid-cols-2 gap-3"
        >
          <Field label="Ticker">
            <input
              required value={v.ticker}
              onChange={(e) => set("ticker", e.target.value.toUpperCase())}
              placeholder="AAPL"
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Type">
            <select value={v.asset_type} onChange={(e) => set("asset_type", e.target.value as PositionInputType["asset_type"])}
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary">
              {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Name" colSpan={2}>
            <input
              value={v.name ?? ""} onChange={(e) => set("name", e.target.value)}
              placeholder="Apple Inc. (optional, fallback to Yahoo)"
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Market">
            <select value={v.market ?? ""} onChange={(e) => set("market", e.target.value)}
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary">
              {MARKETS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Currency">
            <select value={v.currency} onChange={(e) => set("currency", e.target.value)}
              className="w-full bg-input border border-border px-2 py-1.5 text-sm focus:outline-none focus:border-primary">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Shares">
            <input
              type="number" step="any" min="0" required value={v.shares}
              onChange={(e) => set("shares", Number(e.target.value))}
              className="w-full bg-input border border-border px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Avg Cost / Share">
            <input
              type="number" step="any" min="0" required value={v.avg_cost}
              onChange={(e) => set("avg_cost", Number(e.target.value))}
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
