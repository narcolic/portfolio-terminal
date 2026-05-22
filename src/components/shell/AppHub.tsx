import { Link } from "@tanstack/react-router";
import { TerminalCard } from "@/components/terminal/TerminalCard";

const dashboards = [
  {
    title: "Portfolio Tracker",
    path: "/portfolio",
    description: "Stocks & positions",
  },
] as const;

export function AppHub() {
  return (
    <div className="min-h-screen bg-background text-foreground grid-bg px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-primary">TERMINAL HUB</div>
            <h1 className="mt-2 text-2xl font-bold uppercase tracking-[0.2em]">Dashboards</h1>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => (
            <Link key={dashboard.path} to={dashboard.path} className="block">
              <TerminalCard bodyClassName="p-4" className="h-full hover:border-primary">
                <div className="mt-2 text-lg font-bold text-primary">{dashboard.title}</div>
                <p className="mt-2 text-sm text-muted-foreground">{dashboard.description}</p>
                <div className="mt-4 text-[10px] uppercase tracking-[0.25em] text-foreground">
                  &gt; open
                </div>
              </TerminalCard>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
