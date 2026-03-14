"use client";

import { useState } from "react";
import { sendClientMagicLink } from "@/lib/client/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AppLogo } from "@/components/shared/app-logo";
import { Loader2, Mail, CheckCircle } from "lucide-react";

export default function ClientLoginPage() {
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 relative overflow-hidden">
      {/* Decorative background — teal accent instead of orange */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-cyan-600/5 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-cyan-600/5 blur-3xl" />
      </div>

      <Card className="w-full max-w-md border-0 shadow-xl shadow-black/5 animate-scale-in relative">
        <CardHeader className="space-y-4 text-center pb-2">
          <AppLogo size="lg" className="mx-auto" />
          <div>
            <CardTitle className="text-2xl font-bold text-foreground font-heading">
              Centre Portal
            </CardTitle>
            <CardDescription className="mt-1 text-muted-foreground">
              Sign in to view your sessions, reports, and more
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-center space-y-4 py-4 animate-fade-up">
              <CheckCircle className="mx-auto h-12 w-12 text-cyan-600" />
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
                className="w-full h-11 bg-cyan-600 text-white hover:bg-cyan-700 shadow-md shadow-cyan-600/20 transition-all duration-200"
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
          )}
        </CardContent>
      </Card>
    </main>
  );
}
