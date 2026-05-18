import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/dashboard" });
    });
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    nav({ to: "/dashboard" });
  };

  return (
    <div className="relative min-h-screen bg-background grid-bg flex items-center justify-center px-4">
      <div className="absolute inset-0 scanline pointer-events-none" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          <span>TERMINAL v1.0</span>
          <span className="text-bull ticker-blink">● LIVE</span>
        </div>

        <div className="border border-border bg-card">
          <div className="border-b border-border bg-secondary/40 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-primary">
            &gt; AUTH // {mode === "signin" ? "LOGIN" : "REGISTER"}
          </div>

          <form onSubmit={submit} className="p-6 space-y-4">
            <Field label="EMAIL">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-input border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                placeholder="trader@firm.com"
              />
            </Field>
            <Field label="PASSWORD">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-input border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
                placeholder="••••••••"
              />
            </Field>
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary text-primary-foreground py-2 text-xs uppercase tracking-[0.25em] font-bold hover:opacity-90 disabled:opacity-50"
            >
              &gt; {mode === "signin" ? "EXECUTE LOGIN" : "CREATE ACCOUNT"}
            </button>

            <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>OR</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <button
              type="button"
              onClick={google}
              disabled={busy}
              className="w-full border border-border bg-secondary py-2 text-xs uppercase tracking-[0.25em] text-foreground hover:border-primary disabled:opacity-50"
            >
              &gt; CONTINUE WITH GOOGLE
            </button>
          </form>

          <div className="border-t border-border px-6 py-3 text-[11px] text-muted-foreground flex justify-between">
            <span>{mode === "signin" ? "New here?" : "Have an account?"}</span>
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-primary hover:underline uppercase tracking-widest text-[10px]"
            >
              {mode === "signin" ? "Register" : "Sign in"}
            </button>
          </div>
        </div>

        <div className="mt-4 text-[10px] text-muted-foreground text-center">
          <Link to="/" className="hover:text-primary">&lt; back</Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
