import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-primary">Error 404</div>
        <h1 className="mt-2 text-6xl font-bold text-foreground">NO_ROUTE</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          The terminal could not locate that page.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 border border-primary px-4 py-2 text-xs uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          &gt; return_home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-destructive">System fault</div>
        <h1 className="mt-2 text-2xl text-foreground">Page did not load</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="border border-primary px-4 py-2 text-xs uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            &gt; retry
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TERMINAL // Portfolio" },
      { name: "description", content: "Live portfolio dashboard with real-time market data" },
      { property: "og:title", content: "TERMINAL // Portfolio" },
      { name: "twitter:title", content: "TERMINAL // Portfolio" },
      { property: "og:description", content: "Live portfolio dashboard with real-time market data" },
      { name: "twitter:description", content: "Live portfolio dashboard with real-time market data" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/be2c8428-4980-478f-a6fd-1ece11f92f5a/id-preview-ff13847a--70c7f675-c294-4722-856a-310e0cf80862.lovable.app-1779132928567.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/be2c8428-4980-478f-a6fd-1ece11f92f5a/id-preview-ff13847a--70c7f675-c294-4722-856a-310e0cf80862.lovable.app-1779132928567.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthBridge() {
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      qc.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, qc]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthBridge />
      <Outlet />
      <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-foreground)", fontFamily: "var(--font-mono)" } }} />
    </QueryClientProvider>
  );
}
