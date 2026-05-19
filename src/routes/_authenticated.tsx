import { createFileRoute, redirect, Outlet, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-[0.2em]">
          <div className="flex items-center gap-6">
            <div className="font-bold text-primary">▰ PORTFOLIO TERMINAL</div>
            <nav className="hidden md:flex items-center gap-1">
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/positions">Transactions</NavLink>
              <NavLink to="/pnl">P&amp;L</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="hidden sm:inline">
              {now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
                timeZoneName: "short",
              })}
            </span>
            <span className="hidden sm:inline text-bull ticker-blink">● LIVE</span>
            <span className="hidden md:inline truncate max-w-[160px]">{user?.email}</span>
            <button onClick={logout} className="text-primary hover:underline">
              [logout]
            </button>
          </div>
        </div>
        <nav className="md:hidden flex border-t border-border text-[11px] uppercase tracking-[0.2em]">
          <NavLink to="/dashboard">Dash</NavLink>
          <NavLink to="/positions">Tx</NavLink>
          <NavLink to="/pnl">P&amp;L</NavLink>
        </nav>
      </header>
      <main className="p-4 md:p-6 max-w-[1400px] mx-auto">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-3 py-1 hover:text-primary"
      activeProps={{ className: "px-3 py-1 text-primary border-b-2 border-primary" }}
    >
      {children}
    </Link>
  );
}
