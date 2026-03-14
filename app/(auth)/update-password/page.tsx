"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePassword } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/shared/auth-shell";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function UpdatePasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await updatePassword(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    }
  }

  return (
    <AuthShell title="Update Password" description="Enter your new password below">
      {success ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-6 text-center animate-scale-in">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          <p className="text-sm text-emerald-700">
            Password updated successfully. Redirecting to sign in...
          </p>
        </div>
      ) : (
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
              placeholder="Confirm your new password"
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
                Updating...
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
