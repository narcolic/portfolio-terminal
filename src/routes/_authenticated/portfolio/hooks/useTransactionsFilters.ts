import { useEffect, useMemo, useState } from "react";
import type { Enriched } from "@/lib/portfolio/types";

const ALL = "__all__";
const UNASSIGNED = "__unassigned__";

type RowWithNative = Enriched & { _nativeCurrency: string };

export function useTransactionsFilters({
  allRows,
  transactionCurrencies,
}: {
  allRows: RowWithNative[];
  transactionCurrencies: string[];
}) {
  const [selected, setSelected] = useState<string>(ALL);
  const [display, setDisplay] = useState<string>("USD");

  const rows = useMemo(() => {
    if (selected === ALL) return allRows;
    if (selected === UNASSIGNED) return allRows.filter((r) => !r.portfolio_id);
    return allRows.filter((r) => r.portfolio_id === selected);
  }, [allRows, selected]);

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

  const validDisplay = useMemo(
    () => (displayCurrencies.includes(display) ? display : (displayCurrencies[0] ?? "USD")),
    [display, displayCurrencies],
  );

  return {
    selected,
    setSelected,
    display: validDisplay,
    setDisplay,
    rows,
    displayCurrencies,
    allId: ALL,
    unassignedId: UNASSIGNED,
  };
}
