"use client";

import { useState } from "react";
import { sendClientMagicLink } from "@/lib/client/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/shared/auth-shell";
import { stickerClasses } from "@/components/marketing/sticker-button";
import { cn } from "@/lib/utils";
import { Loader2, Mail, CheckCircle } from "lucide-react";

/**
 * The centre/client front door. Shell is the shared AuthShell with the
 * TEAL accent — the client portal's whole-portal convention (owner
 * decision A, Tier-1 plan: structure carries the brand, accent carries
 * the portal; do not orange-ify). The CTA is the same ink-on-yellow
 * sticker as every other door — deliberately accent-independent.
 */
export function ClientLoginForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setError(null);
    setLoading(true);

    const { error: sendError } = await sendClientMagicLink(email.trim());

    setLoading(false);

    if (sendError) {
      setError(sendError);
      return;
    }

    setSent(true);
  }

  return (
    <AuthShell
      title="Centre Portal"
      description="Sign in to view your sessions, reports, and more"
      accent="teal"
    >
      {sent ? (
        <div className="text-center space-y-4 py-4 animate-fade-up">
          <CheckCircle className="mx-auto h-12 w-12 text-cyan-600" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Check your email
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              We&apos;ve sent a magic link to <strong>{email}</strong>. Click
              the link in the email to sign in.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
            className="mt-4"
          >
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive animate-fade-up">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground font-medium">
              Email address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="centre@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
              className="h-11"
            />
          </div>

          <Button
            type="submit"
            className={cn(stickerClasses({ size: "sm" }), "w-full")}
            disabled={loading || !email.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Magic Link
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            No password required — we&apos;ll email you a secure sign-in link.
          </p>
        </form>
      )}
    </AuthShell>
  );
}
