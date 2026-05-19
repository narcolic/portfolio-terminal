import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PortfolioInput = z.object({
  name: z.string().trim().min(1).max(80),
  broker: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type PortfolioInputType = z.infer<typeof PortfolioInput>;

// listPortfolios: Implement client-side fetching using Supabase client SDK for static hosting.

// export const listPortfolios = createServerFn({ method: "GET" })
//   .middleware([requireSupabaseAuth])
//   .handler(async ({ context }) => {
//     const { data, error } = await context.supabase
//       .from("portfolios")
//       .select("*")
//       .order("name", { ascending: true });
//     if (error) throw new Error(error.message);
//     return data ?? [];
//   });

// createPortfolio: Implement client-side mutation using Supabase client SDK for static hosting.

// export const createPortfolio = createServerFn({ method: "POST" })
//   .middleware([requireSupabaseAuth])
//   .inputValidator((input) => PortfolioInput.parse(input))
//   .handler(async ({ data, context }) => {
//     const { error, data: row } = await context.supabase
//       .from("portfolios")
//       .insert({ ...data, user_id: context.userId })
//       .select()
//       .single();
//     if (error) throw new Error(error.message);
//     return row;
//   });

// updatePortfolio: Implement client-side mutation using Supabase client SDK for static hosting.

// export const updatePortfolio = createServerFn({ method: "POST" })
//   .middleware([requireSupabaseAuth])
//   .inputValidator((input) =>
//     PortfolioInput.extend({ id: z.string().uuid() }).parse(input),
//   )
//   .handler(async ({ data, context }) => {
//     const { id, ...rest } = data;
//     const { error, data: row } = await context.supabase
//       .from("portfolios")
//       .update(rest)
//       .eq("id", id)
//       .select()
//       .single();
//     if (error) throw new Error(error.message);
//     return row;
//   });

// deletePortfolio: Implement client-side mutation using Supabase client SDK for static hosting.

// export const deletePortfolio = createServerFn({ method: "POST" })
//   .middleware([requireSupabaseAuth])
//   .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
//   .handler(async ({ data, context }) => {
//     const { error } = await context.supabase
//       .from("portfolios")
//       .delete()
//       .eq("id", data.id);
//     if (error) throw new Error(error.message);
//     return { ok: true };
//   });
