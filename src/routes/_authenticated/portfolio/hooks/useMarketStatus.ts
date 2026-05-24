import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

export type MarketSession = "OPEN" | "PRE_MARKET" | "POST_MARKET" | "CLOSED" | "UNKNOWN";

export type MarketStatusItem = {
  exchange: string;
  session: MarketSession;
  label: string;
  marketTime?: string;
  timezone?: string;
  nextOpen?: string;
  tradingHours?: {
    regular?: { start?: string; end?: string };
    preMarket?: { start?: string; end?: string };
    afterHours?: { start?: string; end?: string };
  };
};

type ApiMarket = {
  id?: string;
  exchange?: string;
  market?: string;
  timezone?: string;
  tradingHours?: MarketStatusItem["tradingHours"];
  status?: {
    isOpen?: boolean;
    status?: string;
    marketTime?: string;
    nextChangeType?: string;
    nextChange?: string;
  };
};

type ApiPayload = {
  markets?: ApiMarket[];
};

const EXCHANGE_NAMES: Record<string, string> = {
  nyse: "NYSE",
  nasdaq: "NASDAQ",
  athex: "ATHEX",
  lse: "XLON",
  xetra: "XETR",
  ams: "XAMS",
  epa: "EPA",
};

const KNOWN_WINDOWS: Record<string, NonNullable<MarketStatusItem["tradingHours"]>> = {
  NYSE: {
    preMarket: { start: "04:00", end: "09:30" },
    regular: { start: "09:30", end: "16:00" },
    afterHours: { start: "16:00", end: "20:00" },
  },
  NASDAQ: {
    preMarket: { start: "04:00", end: "09:30" },
    regular: { start: "09:30", end: "16:00" },
    afterHours: { start: "16:00", end: "20:00" },
  },
  ATHEX: {
    regular: { start: "10:15", end: "17:20" },
  },
  XAMS: {
    regular: { start: "09:00", end: "17:30" },
  },
  XLON: {
    regular: { start: "08:00", end: "16:30" },
  },
  XETR: {
    regular: { start: "09:00", end: "17:30" },
  },
  EPA: {
    regular: { start: "09:00", end: "17:30" },
  },
};

function toSession(raw: string | undefined, isOpen: boolean | undefined): MarketSession {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("pre")) return "PRE_MARKET";
  if (s.includes("after") || s.includes("post")) return "POST_MARKET";
  if (s.includes("open") || isOpen) return "OPEN";
  if (s.includes("closed") || isOpen === false) return "CLOSED";
  return "UNKNOWN";
}

function toLabel(session: MarketSession): string {
  if (session === "OPEN") return "Open";
  if (session === "PRE_MARKET") return "Pre-Market";
  if (session === "POST_MARKET") return "After-Hours";
  if (session === "CLOSED") return "Closed";
  return "Unknown";
}

function normalizeExchange(raw: string): string {
  const k = raw.trim().toLowerCase();
  return EXCHANGE_NAMES[k] ?? raw.toUpperCase();
}

function normalizeMarket(m: ApiMarket): MarketStatusItem {
  const rawStatus = m.status?.status;
  const session = toSession(rawStatus, m.status?.isOpen);
  const exchange = normalizeExchange(String(m.id ?? m.exchange ?? m.market ?? ""));
  const nextOpen = m.status?.nextChangeType === "open" ? m.status?.nextChange : undefined;

  return {
    exchange,
    session,
    label: toLabel(session),
    marketTime: m.status?.marketTime,
    timezone: m.timezone,
    nextOpen,
    tradingHours: m.tradingHours ?? KNOWN_WINDOWS[exchange],
  };
}

const PRIORITY = ["ATHEX", "NYSE", "NASDAQ", "XAMS", "XLON", "XETR", "EPA"];

function priorityOf(exchange: string): number {
  const i = PRIORITY.indexOf(exchange.toUpperCase());
  return i === -1 ? 999 : i;
}

function pickMostRelevant(markets: MarketStatusItem[], requested: string[]): MarketStatusItem | null {
  if (markets.length === 0) return null;

  const requestedOrder = new Map(requested.map((e, i) => [e.toUpperCase(), i]));
  const sorted = markets.slice().sort((a, b) => {
    const pa = priorityOf(a.exchange);
    const pb = priorityOf(b.exchange);
    if (pa !== pb) return pa - pb;

    const ra = requestedOrder.get(a.exchange.toUpperCase()) ?? 999;
    const rb = requestedOrder.get(b.exchange.toUpperCase()) ?? 999;
    if (ra !== rb) return ra - rb;

    return a.exchange.localeCompare(b.exchange);
  });

  return sorted[0] ?? null;
}

export function useMarketStatus(exchanges: string[]) {
  const requested = useMemo(
    () => Array.from(new Set(exchanges.map((e) => e.trim().toUpperCase()).filter(Boolean))),
    [exchanges],
  );

  const query = useQuery({
    queryKey: ["market-status", requested.join(",")],
    queryFn: async () => {
      const qs = encodeURIComponent(requested.join(","));
      const response = await fetch(`/api/market-status?exchanges=${qs}`);
      if (!response.ok) throw new Error(`Market status API error (${response.status})`);
      const json = (await response.json()) as ApiPayload;
      return (json.markets ?? []).map(normalizeMarket);
    },
    enabled: requested.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: true,
  });

  const markets = query.data ?? [];
  const selected = useMemo(() => pickMostRelevant(markets, requested), [markets, requested]);

  return {
    ...query,
    markets,
    selected,
  };
}
