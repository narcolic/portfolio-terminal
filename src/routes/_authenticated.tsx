import {
  createFileRoute,
  redirect,
  Outlet,
  Link,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  };

  const isPortfolio = pathname.startsWith("/portfolio");
  const isCarService = pathname.startsWith("/car-service");

  const title = isPortfolio
    ? "> PORTFOLIO TERMINAL"
    : isCarService
      ? "> CAR SERVICE"
      : "> TERMINAL HUB";

  const desktopLinks = isPortfolio
    ? [
        { to: "/portfolio", label: "Dashboard", short: "Dash" },
        { to: "/portfolio/transactions", label: "Transactions", short: "Tx" },
        { to: "/portfolio/pnl", label: "P&L", short: "P&L" },
      ]
    : isCarService
      ? [
          { to: "/car-service", label: "Overview", short: "Home" },
          { to: "/car-service/history", label: "History", short: "Hist" },
          { to: "/car-service/analytics", label: "Analytics", short: "Data" },
          { to: "/car-service/vehicles", label: "Vehicles", short: "Cars" },
        ]
      : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar userEmail={user?.email} onLogout={logout} />
      <header className="border-b border-border bg-card sticky top-10 z-[9]">
        <div className="flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-[0.2em]">
          <div className="flex items-center gap-4">
            <div className="font-bold text-primary">{title}</div>
            {desktopLinks.length > 0 ? (
              <nav className="hidden md:flex items-center gap-1 text-[10px] text-muted-foreground">
                {desktopLinks.map((link) => (
                  <RowNavLink key={link.to} to={link.to}>
                    {link.label}
                  </RowNavLink>
                ))}
              </nav>
            ) : null}
          </div>
          {isPortfolio ? (
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
          ) : null}
        </div>
        {desktopLinks.length > 0 ? (
          <nav className="md:hidden flex border-t border-border text-[10px] uppercase tracking-[0.2em]">
            {desktopLinks.map((link) => (
              <RowNavLink key={link.to} to={link.to}>
                {link.short}
              </RowNavLink>
            ))}
          </nav>
        ) : null}
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
