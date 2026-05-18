import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PositionInput = z.object({
  ticker: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.\-^=]+$/),
  name: z.string().trim().max(120).optional().nullable(),
  asset_type: z.enum(["stock", "etf", "crypto", "bond", "fund", "other"]),
  market: z.string().trim().max(40).optional().nullable(),
  currency: z.string().trim().min(3).max(5).default("USD"),
  shares: z.number().nonnegative().max(1e9),
  avg_cost: z.number().nonnegative().max(1e9),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type PositionInputType = z.infer<typeof PositionInput>;

export const listPositions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("positions")
      .select("*")
      .order("ticker", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PositionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("positions")
      .insert({ ...data, ticker: data.ticker.toUpperCase(), user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updatePosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    PositionInput.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error, data: row } = await context.supabase
      .from("positions")
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
    const { error } = await context.supabase.from("positions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
