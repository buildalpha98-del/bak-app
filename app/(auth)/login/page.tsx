"use client";

import { useState, useRef } from "react";
import Link from "@/components/ui/app-link";
import { signIn } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/shared/auth-shell";
import { Loader2, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [rememberMe, setRememberMe] = useState(true);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current || loading) return;

    setError(null);
    setLoading(true);

    // Store preference before signIn (which redirects on success)
    if (!rememberMe) {
      localStorage.setItem("bak-session-ephemeral", "true");
    } else {
      localStorage.removeItem("bak-session-ephemeral");
    }

    const formData = new FormData(formRef.current);
    const result = await signIn(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Welcome Back" description="Sign in to your Build Alpha Kids account">
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive animate-fade-up font-medium">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email" className="text-foreground font-semibold text-xs uppercase tracking-wider">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@buildalphakids.com.au"
            required
            autoComplete="email"
            disabled={loading}
            className="h-12 rounded-xl bg-background/50 border-border/60 focus:border-primary focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-foreground font-semibold text-xs uppercase tracking-wider">
            Password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Enter your password"
            required
            autoComplete="current-password"
            disabled={loading}
            className="h-12 rounded-xl bg-background/50 border-border/60 focus:border-primary focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
          />
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none group py-1">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            disabled={loading}
            className="h-4 w-4 rounded accent-primary cursor-pointer"
          />
          <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
            Keep me signed in
          </span>
        </label>

        <button
          type="submit"
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all duration-300 font-bold text-sm tracking-wide group inline-flex items-center justify-center disabled:pointer-events-none disabled:opacity-50"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>

        <div className="text-center pt-1">
          <Link
            href="/reset-password"
            className="text-sm font-medium text-primary hover:text-primary/80 transition-colors duration-200 underline underline-offset-4 decoration-primary/30 hover:decoration-primary/60"
          >
            Forgot your password?
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
