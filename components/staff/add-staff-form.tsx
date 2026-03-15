"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Copy, KeyRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createStaffMember } from "@/lib/staff/actions";
import type { UserRole } from "@/lib/types/enums";

export function AddStaffForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("coach");
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    tempPassword: string;
    id: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const name = (form.get("name") as string).trim();
    const email = (form.get("email") as string).trim();
    const phone = (form.get("phone") as string).trim() || undefined;
    const rateStr = form.get("default_pay_rate") as string;
    const default_pay_rate = rateStr ? parseFloat(rateStr) : undefined;

    if (!name || !email) {
      setError("Name and email are required.");
      setLoading(false);
      return;
    }

    const result = await createStaffMember({
      name,
      email,
      phone,
      role,
      default_pay_rate,
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    if (result.data) {
      setCreated({
        name,
        email,
        tempPassword: result.data.tempPassword,
        id: result.data.id,
      });
    }

    setLoading(false);
  }

  // Success state — show credentials
  if (created) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" render={<Link href="/admin/staff" />} aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Staff Member Created</h1>
        </div>

        <div className="rounded-lg border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <p className="font-medium">{created.name} has been added successfully.</p>
          </div>

          <p className="text-sm text-muted-foreground">
            Share these login credentials with {created.name.split(" ")[0]}. They&apos;ll be prompted to set a new password on first login.
          </p>

          <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="font-mono text-sm">{created.email}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Temporary Password</Label>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm select-all flex-1">{created.tempPassword}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(created.tempPassword);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Login URL</Label>
              <p className="font-mono text-sm">bak-app.vercel.app/login</p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => router.push(`/admin/staff/${created.id}`)}
            >
              View Profile
            </Button>
            <Button variant="outline" onClick={() => {
              setCreated(null);
              setError(null);
            }}>
              Add Another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/admin/staff" />} aria-label="Go back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Add Staff Member</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-card p-6">
        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="name">Full Name *</Label>
          <Input id="name" name="name" required placeholder="e.g. Sarah Johnson" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="e.g. sarah@buildalpha.com.au"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" placeholder="e.g. 0412 345 678" />
        </div>

        <div className="space-y-1.5">
          <Label>Role *</Label>
          <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="coach">Coach</SelectItem>
              <SelectItem value="ops">Ops</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="default_pay_rate">Default Pay Rate ($)</Label>
          <Input
            id="default_pay_rate"
            name="default_pay_rate"
            type="number"
            step="0.01"
            min="0"
            placeholder="e.g. 45.00"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="submit"
            disabled={loading}
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <KeyRound className="h-4 w-4" />
            {loading ? "Creating..." : "Create Staff Member"}
          </Button>
          <Button variant="outline" render={<Link href="/admin/staff" />}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
