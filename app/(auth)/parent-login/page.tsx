"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sendParentMagicLink } from "@/lib/parent/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLogo } from "@/components/shared/app-logo";
import { Loader2, Mail, CheckCircle } from "lucide-react";

// Only this component reads useSearchParams(), so only it suspends —
// the page shell (background, logo, card frame) renders statically.
function ParentLoginForm() {
  const searchParams = useSearchParams();
  // Post-login destination (e.g. /parent/book/<id>?waitlist=<entry>
  // from the marketing site's Book now buttons or a waitlist email).
  // Sanitised server-side by parentSafeNext.
  const next = searchParams.get("next") ?? undefined;

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setError(null);
    setLoading(true);

    const { error: sendError } = await sendParentMagicLink(email.trim(), next);

    setLoading(false);

    if (sendError) {
      setError(sendError);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="text-center space-y-4 py-4 animate-fade-up">
        <CheckCircle className="mx-auto h-12 w-12 text-primary" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Check your email
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            We've sent a magic link to <strong>{email}</strong>. Click the
            link in the email to sign in.
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
    );
  }

  return (
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
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={loading}
          className="h-12 rounded-lg"
        />
      </div>

      <Button
        type="submit"
        className="w-full h-12 bg-primary text-white hover:bg-[#D4651F] shadow-md shadow-orange-600/20 transition-all duration-200 rounded-lg text-base"
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
        No password required — we'll email you a secure sign-in link.
      </p>
    </form>
  );
}

// Skeleton matching the form's shape (label, h-12 input, h-12 button,
// caption) so the suspended slot doesn't shift the card's height.
function ParentLoginFormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="mx-auto h-4 w-64" />
    </div>
  );
}

// useSearchParams() requires a Suspense boundary when used in a page
// (Next 16 CSR bailout rule). Keep the static shell OUTSIDE the
// boundary so the prerendered conversion page never flashes blank —
// only the form slot suspends, behind a same-height skeleton.
export default function ParentLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-orange-50/50 px-4 relative overflow-hidden">
      {/* Warm decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-orange-200/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-orange-200/30 blur-3xl" />
      </div>

      <Card className="w-full max-w-md border-0 shadow-xl shadow-black/5 animate-scale-in relative">
        <CardHeader className="space-y-4 text-center pb-2">
          <AppLogo size="lg" className="mx-auto" />
          <div>
            <CardTitle className="text-2xl font-bold text-foreground font-heading">
              Parent Portal
            </CardTitle>
            <CardDescription className="mt-1 text-muted-foreground">
              Sign in to book sessions for your kids
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<ParentLoginFormSkeleton />}>
            <ParentLoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
