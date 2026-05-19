import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TransactionInput = z.object({
  ticker: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9.\-^=:_]+$/),
  name: z.string().trim().max(120).optional().nullable(),
  asset_type: z.enum(["stock", "etf", "crypto", "bond", "fund", "other"]),
  market: z.string().trim().max(40).optional().nullable(),
  currency: z.string().trim().min(3).max(5).default("USD"),
  shares: z.number().positive().max(1e9),
  price: z.number().nonnegative().max(1e9),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(500).optional().nullable(),
  portfolio_id: z.string().uuid().optional().nullable(),
});

export type TransactionInputType = z.infer<typeof TransactionInput>;
// Back-compat alias used by some imports
export type PositionInputType = TransactionInputType;

// listPositions: Implement client-side fetching using Supabase client SDK for static hosting.

// createPosition: Implement client-side mutation using Supabase client SDK for static hosting.

// updatePosition: Implement client-side mutation using Supabase client SDK for static hosting.

// deletePosition: Implement client-side mutation using Supabase client SDK for static hosting.

// bulkImportPositions: Implement client-side mutation using Supabase client SDK for static hosting.

// bulkDeletePositions: Implement client-side mutation using Supabase client SDK for static hosting.
