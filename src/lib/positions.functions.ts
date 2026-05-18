import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TransactionInput = z.object({
  ticker: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.\-^=]+$/),
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

export const listPositions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transactions")
      .select("*")
      .order("transaction_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TransactionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("transactions")
      .insert({ ...data, ticker: data.ticker.toUpperCase(), user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updatePosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    TransactionInput.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error, data: row } = await context.supabase
      .from("transactions")
      .update({ ...rest, ticker: rest.ticker.toUpperCase() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("transactions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkImportPositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      rows: z.array(TransactionInput).min(1).max(1000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = data.rows.map((r) => ({
      ...r,
      ticker: r.ticker.toUpperCase(),
      user_id: context.userId,
    }));
    const { error, data: rows } = await context.supabase
      .from("transactions")
      .insert(payload)
      .select();
    if (error) throw new Error(error.message);
    return { inserted: rows?.length ?? 0 };
  });

export const bulkDeletePositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("transactions")
      .delete()
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { deleted: data.ids.length };
  });
