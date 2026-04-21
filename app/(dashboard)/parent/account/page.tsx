"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { getParentProfile, updateParentProfile, getParentChildren } from "@/lib/parent/actions";
import { getParentPackageBalances } from "@/lib/bookings/booking-actions";
import { getParentPayments } from "@/lib/parent/payment-actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { ParentProfile, PackageBalance, Package, Payment } from "@/lib/types/database";
import {
  Loader2,
  Save,
  LogOut,
  Users,
  Package as PackageIcon,
  CreditCard,
  ExternalLink,
  Check,
} from "lucide-react";

type PackageBalanceWithPackage = PackageBalance & { package: Package };

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function packageStatusColour(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700 border-green-200";
    case "expired":
      return "bg-gray-100 text-gray-500 border-gray-200";
    case "used_up":
      return "bg-amber-100 text-amber-700 border-amber-200";
    default:
      return "bg-gray-100 text-gray-500 border-gray-200";
  }
}

function paymentStatusColour(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700 border-green-200";
    case "pending":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "failed":
      return "bg-red-100 text-red-700 border-red-200";
    case "refunded":
      return "bg-blue-100 text-blue-700 border-blue-200";
    default:
      return "bg-gray-100 text-gray-500 border-gray-200";
  }
}

export default function ParentAccountPage() {
  const router = useRouter();

  // Profile state
  const [profile, setProfile] = useState<ParentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [suburb, setSuburb] = useState("");

  // Children count
  const [childrenCount, setChildrenCount] = useState(0);

  // Packages
  const [packageBalances, setPackageBalances] = useState<PackageBalanceWithPackage[]>([]);

  // Payments
  const [payments, setPayments] = useState<Payment[]>([]);

  // Marketing opt-in
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [savingMarketing, setSavingMarketing] = useState(false);
  const [marketingSaved, setMarketingSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const [profileRes, childrenRes, packagesRes, paymentsRes] = await Promise.all([
        getParentProfile(),
        getParentChildren(),
        getParentPackageBalances(),
        getParentPayments(),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        setFirstName(profileRes.data.first_name);
        setLastName(profileRes.data.last_name);
        setPhone(profileRes.data.phone ?? "");
        setSuburb(profileRes.data.suburb ?? "");
        setMarketingOptIn(profileRes.data.marketing_opt_in);
      }

      setChildrenCount(childrenRes.data.length);
      setPackageBalances(packagesRes.data);
      setPayments(paymentsRes.data);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    setSaving(true);

    const { error: saveError } = await updateParentProfile({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
      suburb: suburb.trim() || null,
    });

    setSaving(false);

    if (saveError) {
      setError(saveError);
      toast.error("Could not save your profile. Please try again.");
      return;
    }

    setSuccess(true);
    toast.success("Profile updated successfully.");
    setTimeout(() => setSuccess(false), 3000);
  }

  async function handleMarketingToggle(checked: boolean) {
    setMarketingOptIn(checked);
    setSavingMarketing(true);
    setMarketingSaved(false);

    const { error: saveError } = await updateParentProfile({
      marketing_opt_in: checked,
    });

    setSavingMarketing(false);

    if (saveError) {
      // Revert on error
      setMarketingOptIn(!checked);
      toast.error("Could not update your preference. Please try again.");
      return;
    }

    toast.success(checked ? "Marketing emails enabled." : "Marketing emails disabled.");
    setMarketingSaved(true);
    setTimeout(() => setMarketingSaved(false), 3000);
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/parent-login");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#E8712A]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Manage your profile and settings
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <Check className="h-4 w-4" />
          Profile updated successfully.
        </div>
      )}

      {/* ── Profile Details ── */}
      <div className="rounded-xl border border-orange-100 bg-white p-5 space-y-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Your Details
        </h2>

        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input
            value={profile?.email ?? ""}
            disabled
            className="h-11 rounded-lg bg-gray-50"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="h-11 rounded-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="h-11 rounded-lg"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0400 000 000"
            className="h-11 rounded-lg"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="suburb">Suburb</Label>
          <Input
            id="suburb"
            value={suburb}
            onChange={(e) => setSuburb(e.target.value)}
            placeholder="e.g. Bankstown"
            className="h-11 rounded-lg"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !firstName.trim() || !lastName.trim()}
          className="w-full h-11 bg-[#E8712A] text-white hover:bg-[#D4651F] rounded-lg"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* ── Children ── */}
      <Link href="/parent/kids" className="block">
        <div className="rounded-xl border border-orange-100 bg-white p-5 flex items-center justify-between hover:border-[#E8712A]/40 transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
              <Users className="h-5 w-5 text-[#E8712A]" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Children
              </h2>
              <p className="text-sm text-foreground mt-0.5">
                Manage your children&apos;s profiles
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-orange-200 text-[#E8712A]">
            {childrenCount}
          </Badge>
        </div>
      </Link>

      {/* ── Packages ── */}
      <div className="rounded-xl border border-orange-100 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Packages
          </h2>
          <Link
            href="/parent/packages"
            className="text-xs font-medium text-[#E8712A] hover:underline"
          >
            Browse Packages
          </Link>
        </div>

        {packageBalances.length === 0 ? (
          <div className="text-center py-4">
            <PackageIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No packages yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {packageBalances.map((pb) => {
              const progress =
                pb.total_sessions > 0
                  ? ((pb.total_sessions - pb.remaining_sessions) / pb.total_sessions) * 100
                  : 0;
              return (
                <div
                  key={pb.id}
                  className="rounded-lg border border-gray-100 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {pb.package.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={packageStatusColour(pb.status)}
                    >
                      {pb.status === "used_up"
                        ? "Used Up"
                        : pb.status.charAt(0).toUpperCase() + pb.status.slice(1)}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {pb.remaining_sessions} of {pb.total_sessions} sessions remaining
                    </span>
                    <span>Expires {formatDate(pb.expires_at)}</span>
                  </div>

                  <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#E8712A] transition-all"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Payment History ── */}
      <div className="rounded-xl border border-orange-100 bg-white p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Payment History
          </h2>
        </div>

        {payments.length === 0 ? (
          <div className="text-center py-4">
            <CreditCard className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No payments yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5"
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {payment.payment_type === "package_purchase"
                      ? "Package Purchase"
                      : "Session Booking"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(payment.created_at)}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className="text-sm font-medium text-foreground">
                    {formatCents(payment.amount_cents)}
                  </span>
                  <Badge
                    variant="outline"
                    className={paymentStatusColour(payment.status)}
                  >
                    {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                  </Badge>
                  {payment.square_payment_id && (
                    <a
                      href={`https://squareup.com/receipt/preview/${payment.square_payment_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-[#E8712A] transition-colors"
                      title="View receipt"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Settings ── */}
      <div className="rounded-xl border border-orange-100 bg-white p-5 space-y-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Settings
        </h2>

        <label className="flex items-center justify-between cursor-pointer">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">Marketing emails</p>
            <p className="text-xs text-muted-foreground">
              Receive news, promotions and session updates
            </p>
          </div>
          <div className="relative flex items-center gap-2">
            {savingMarketing && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            {marketingSaved && (
              <Check className="h-3.5 w-3.5 text-green-600" />
            )}
            <button
              type="button"
              role="switch"
              aria-checked={marketingOptIn}
              onClick={() => handleMarketingToggle(!marketingOptIn)}
              disabled={savingMarketing}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8712A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                marketingOptIn ? "bg-[#E8712A]" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  marketingOptIn ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </label>
      </div>

      {/* ── Sign Out ── */}
      <Button
        variant="outline"
        onClick={handleSignOut}
        className="w-full h-11 rounded-lg text-muted-foreground"
      >
        <LogOut className="mr-2 h-4 w-4" />
        Sign Out
      </Button>
    </div>
  );
}
