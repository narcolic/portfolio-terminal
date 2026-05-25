import { createFileRoute, redirect, Outlet, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { MarketStatusIndicator } from "@/routes/_authenticated/portfolio/components/MarketStatusIndicator";
import { TopBar } from "@/components/shell/TopBar";

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
      <TopBar userEmail={user?.email} onLogout={logout} />
      <header className="border-b border-border bg-card sticky top-10 z-[9]">
        <div className="flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-[0.2em]">
          <div className="flex items-center gap-4">
            <div className="font-bold text-primary">&gt; PORTFOLIO TERMINAL</div>
            <nav className="hidden md:flex items-center gap-1 text-[10px] text-muted-foreground">
              <RowNavLink to="/portfolio">Dashboard</RowNavLink>
              <RowNavLink to="/portfolio/transactions">Transactions</RowNavLink>
              <RowNavLink to="/portfolio/pnl">P&amp;L</RowNavLink>
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
            <span className="hidden sm:inline">
              <MarketStatusIndicator exchanges={["ATHEX", "NYSE", "XETR"]} />
            </span>
          </div>
        </div>
        <nav className="md:hidden flex border-t border-border text-[10px] uppercase tracking-[0.2em]">
          <RowNavLink to="/portfolio">Dash</RowNavLink>
          <RowNavLink to="/portfolio/transactions">Tx</RowNavLink>
          <RowNavLink to="/portfolio/pnl">P&amp;L</RowNavLink>
        </nav>
      </header>
      <main className="p-4 md:p-6 max-w-[1400px] mx-auto">
        <Outlet />
      </main>
    </div>
  );
}

function RowNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className="px-3 py-1 hover:text-foreground"
      activeProps={{ className: "px-3 py-1 text-primary border-b-2 border-primary" }}
    >
      {children}
    </Link>
  );
}
