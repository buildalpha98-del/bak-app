"use client";

import { useState } from "react";
import { setInitialPassword } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/shared/auth-shell";
import { Loader2 } from "lucide-react";

export default function SetPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await setInitialPassword(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome to Build Alpha Kids"
      description="Please set your password to get started"
    >
      <form action={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive animate-fade-up">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="password" className="text-foreground font-medium">
            New password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Minimum 8 characters"
            required
            minLength={8}
            autoComplete="new-password"
            disabled={loading}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-foreground font-medium">
            Confirm password
          </Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            placeholder="Confirm your password"
            required
            minLength={8}
            autoComplete="new-password"
            disabled={loading}
            className="h-11"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 transition-all duration-200"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Setting password...
            </>
          ) : (
            "Set password & continue"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
