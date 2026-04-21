"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  getActivePackages,
  getParentPackageBalances,
  purchasePackage,
} from "@/lib/bookings/booking-actions";
import { SquarePayment } from "@/components/payments/square-payment";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Package, PackageBalance } from "@/lib/types/database";
import {
  Loader2,
  Package as PackageIcon,
  Check,
  Clock,
  Sparkles,
} from "lucide-react";

export default function ParentPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [balances, setBalances] = useState<
    (PackageBalance & { package: Package })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const [pkgRes, balRes] = await Promise.all([
      getActivePackages(),
      getParentPackageBalances(),
    ]);
    if (pkgRes.data) setPackages(pkgRes.data);
    if (balRes.data) setBalances(balRes.data);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handlePaymentSuccess(paymentId: string) {
    if (!selectedPackage) return;

    const { error: purchaseError } = await purchasePackage(
      selectedPackage.id,
      paymentId
    );

    if (purchaseError) {
      setError(purchaseError);
      setSelectedPackage(null);
      toast.error("Purchase could not be completed. Please try again.");
      return;
    }

    toast.success(`${selectedPackage.name} purchased! Your sessions are ready to use.`);
    setSuccessMessage(
      `Successfully purchased ${selectedPackage.name}! Your sessions are ready to use.`
    );
    setSelectedPackage(null);
    setError(null);
    await loadData();

    setTimeout(() => setSuccessMessage(null), 5000);
  }

  function handlePaymentError(errorMsg: string) {
    setError(errorMsg);
    setSelectedPackage(null);
    toast.error("Payment failed. Please try again or use a different card.");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[#E8712A]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Session Packs</h1>
        <p className="text-muted-foreground mt-1">
          Purchase session packs for great savings on your bookings
        </p>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <Check className="h-5 w-5 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-800">
            {successMessage}
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* My Session Packs */}
      {balances.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <PackageIcon className="h-5 w-5 text-[#E8712A]" />
            My Session Packs
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((balance) => {
              const progressPct =
                balance.total_sessions > 0
                  ? Math.round(
                      ((balance.total_sessions - balance.remaining_sessions) /
                        balance.total_sessions) *
                        100
                    )
                  : 0;
              const expiresDate = new Date(balance.expires_at);
              const isExpiringSoon =
                expiresDate.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

              return (
                <div
                  key={balance.id}
                  className="rounded-xl border border-orange-100 bg-white p-5 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-foreground">
                      {balance.package.name}
                    </h3>
                    <Badge
                      variant="outline"
                      className="border-green-200 text-green-700 bg-green-50"
                    >
                      Active
                    </Badge>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <span className="text-xl font-bold text-foreground">
                      {balance.remaining_sessions}
                    </span>{" "}
                    / {balance.total_sessions} sessions remaining
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#E8712A] transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <div
                    className={`flex items-center gap-1.5 text-xs ${
                      isExpiringSoon
                        ? "text-amber-600 font-medium"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Expires{" "}
                    {expiresDate.toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Available Packages */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#E8712A]" />
          Available Packages
        </h2>

        {packages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 rounded-xl bg-white border border-orange-100">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-[#E8712A] mb-3">
              <PackageIcon className="h-7 w-7" />
            </div>
            <p className="text-sm text-muted-foreground">
              No packages are currently available. Check back soon!
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="rounded-xl border border-orange-100 bg-white p-5 space-y-4 flex flex-col"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-foreground">{pkg.name}</h3>
                  {pkg.savings_cents > 0 && (
                    <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
                      Save ${(pkg.savings_cents / 100).toFixed(2)}!
                    </Badge>
                  )}
                </div>

                {pkg.description && (
                  <p className="text-sm text-muted-foreground">
                    {pkg.description}
                  </p>
                )}

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sessions</span>
                    <span className="font-semibold">
                      {pkg.session_count} sessions
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span className="text-xl font-bold text-[#E8712A]">
                      ${(pkg.price_cents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Valid for {pkg.valid_days} days from purchase
                  </div>
                </div>

                <div className="mt-auto pt-2">
                  <Button
                    className="w-full bg-[#E8712A] hover:bg-[#D4641F] text-white"
                    onClick={() => {
                      setSelectedPackage(pkg);
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    disabled={selectedPackage !== null}
                  >
                    Buy Package
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Payment modal */}
      {selectedPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                Purchase {selectedPackage.name}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedPackage(null)}
              >
                Cancel
              </Button>
            </div>

            <div className="rounded-lg bg-orange-50 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pack</span>
                <span className="font-medium">{selectedPackage.name}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Sessions</span>
                <span className="font-medium">
                  {selectedPackage.session_count}
                </span>
              </div>
              <div className="flex justify-between mt-2 pt-2 border-t border-orange-200">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-[#E8712A]">
                  ${(selectedPackage.price_cents / 100).toFixed(2)}
                </span>
              </div>
            </div>

            <SquarePayment
              amountCents={selectedPackage.price_cents}
              onPaymentSuccess={handlePaymentSuccess}
              onPaymentError={handlePaymentError}
              idempotencyKey={`pkg-${selectedPackage.id}-${Date.now()}`}
              packageId={selectedPackage.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}
