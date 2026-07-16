"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { getBookableSession } from "@/lib/bookings/actions";
import { getParentChildren } from "@/lib/parent/actions";
import {
  createBooking,
  getParentPackageBalances,
} from "@/lib/bookings/booking-actions";
import { SquarePayment } from "@/components/payments/square-payment";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  BookableSession,
  BookingChildEntry,
  PackageBalance,
  Package,
} from "@/lib/types/database";
import type { Child } from "@/lib/types/database";
import {
  Loader2,
  Calendar,
  Clock,
  MapPin,
  Users,
  Check,
  ArrowLeft,
  Download,
  CreditCard,
  Package as PackageIcon,
  Gift,
  Tag,
} from "lucide-react";
import Link from "@/components/ui/app-link";

function generateICS(
  session: BookableSession,
  children: Child[]
): string {
  // Format date/time as local values with TZID — never convert to UTC
  const startDate = session.date.replace(/-/g, "");
  const startTime = session.start_time.replace(/:/g, "").slice(0, 4) + "00";
  const endTime = session.end_time.replace(/:/g, "").slice(0, 4) + "00";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Build Alpha Kids//Booking//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE",
    "TZID:Australia/Sydney",
    "BEGIN:STANDARD",
    "DTSTART:19700405T030000",
    "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=4",
    "TZOFFSETFROM:+1100",
    "TZOFFSETTO:+1000",
    "TZNAME:AEST",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19701004T020000",
    "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=10",
    "TZOFFSETFROM:+1000",
    "TZOFFSETTO:+1100",
    "TZNAME:AEDT",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `DTSTART;TZID=Australia/Sydney:${startDate}T${startTime}`,
    `DTEND;TZID=Australia/Sydney:${startDate}T${endTime}`,
    `SUMMARY:${session.title} - Build Alpha Kids`,
    `LOCATION:${session.location_address ?? ""}`,
    `DESCRIPTION:Children: ${children.map((c) => `${c.first_name} ${c.last_name}`).join("\\, ")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  const suffix = h >= 12 ? "pm" : "am";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:${minutes}${suffix}`;
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function BookingFlowPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<BookableSession | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [packageBalances, setPackageBalances] = useState<(PackageBalance & { package: Package })[]>([]);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  // Discount code + referral credit state
  const [discountCode, setDiscountCode] = useState("");
  const [discountApplied, setDiscountApplied] = useState<{ codeId: string; valueCents: number } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [referralCredits, setReferralCredits] = useState<{ creditCents: number; hasFreeSession: boolean; rewards: Array<{ id: string; reward_type: string; reward_value_cents: number | null; reward_description: string }> }>({ creditCents: 0, hasFreeSession: false, rewards: [] });
  const [referralCreditApplied, setReferralCreditApplied] = useState(false);
  const [freeSessionApplied, setFreeSessionApplied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [sessionResult, childrenResult] = await Promise.all([
          getBookableSession(sessionId),
          getParentChildren(),
        ]);
        if (sessionResult.data) setSession(sessionResult.data);
        if (childrenResult.data) setChildren(childrenResult.data.map((pc) => pc.child));
      } catch {
        toast.error("Could not load session details. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sessionId]);

  useEffect(() => {
    if (step === 3) {
      getParentPackageBalances()
        .then((result) => setPackageBalances(result.data))
        .catch(() => setPackageBalances([]));
      // Load referral credits
      import("@/lib/referrals/actions")
        .then(({ getParentReferralCredits }) =>
          import("@/lib/parent/actions").then(({ getParentProfile }) =>
            getParentProfile().then((profileResult) => {
              if (profileResult.data?.id) {
                getParentReferralCredits(profileResult.data.id).then(
                  (creditsResult) => {
                    if (creditsResult.data) setReferralCredits(creditsResult.data);
                  }
                );
              }
            })
          )
        )
        .catch(() => {});
      handleCreatePendingBooking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function getChildAge(child: Child): number | null {
    if (!child.date_of_birth) return null;
    const dob = new Date(child.date_of_birth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < dob.getDate())
    ) {
      age--;
    }
    return age;
  }

  function isChildEligible(child: Child): boolean {
    if (!session) return false;
    const age = getChildAge(child);
    if (age === null) return true;
    return (
      age >= (session.age_group_min ?? 0) &&
      age <= (session.age_group_max ?? 99)
    );
  }

  function toggleChild(childId: string) {
    setSelectedChildIds((prev) =>
      prev.includes(childId)
        ? prev.filter((id) => id !== childId)
        : [...prev, childId]
    );
  }

  const selectedChildren = children.filter((c) =>
    selectedChildIds.includes(c.id)
  );
  const subtotal = (session?.price_cents ?? 0) * selectedChildIds.length;

  async function handlePackageRedemption(packageBalanceId: string) {
    if (!session) return;
    setSubmitting(true);
    try {
      const childEntries: BookingChildEntry[] = selectedChildren.map((c) => ({
        child_id: c.id,
        child_name: `${c.first_name} ${c.last_name}`,
        age_group: c.age_group,
      }));
      await createBooking({
        bookable_session_id: session.id,
        children: childEntries,
        payment_type: "package_redemption",
        package_balance_id: packageBalanceId,
      });
      toast.success("Booking confirmed! Session redeemed from your pack.");
      setStep(4);
    } catch {
      toast.error("Booking failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreatePendingBooking() {
    if (!session) return;
    setSubmitting(true);
    setPaymentError(null);
    try {
      const childEntries: BookingChildEntry[] = selectedChildren.map((c) => ({
        child_id: c.id,
        child_name: `${c.first_name} ${c.last_name}`,
        age_group: c.age_group,
      }));
      const result = await createBooking({
        bookable_session_id: session.id,
        children: childEntries,
        payment_type: "single_payment",
      });
      if (result.data) {
        setPendingBookingId(result.data.id);
      }
    } catch {
      toast.error("Could not prepare your booking. Please try again.");
      setPaymentError("Failed to create booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApplyDiscount() {
    if (!discountCode.trim()) return;
    setDiscountLoading(true);
    setDiscountError(null);
    try {
      const { validateDiscountCode } = await import("@/lib/referrals/discount-actions");
      const result = await validateDiscountCode(discountCode.trim());
      if (result.error || !result.data?.valid) {
        setDiscountError(result.error || "Invalid or expired discount code.");
        toast.error("Invalid or expired discount code.");
      } else {
        setDiscountApplied({ codeId: result.data.codeId, valueCents: result.data.valueCents });
        toast.success("Discount code applied!");
      }
    } catch {
      setDiscountError("Failed to validate code.");
      toast.error("Could not validate discount code. Please try again.");
    } finally {
      setDiscountLoading(false);
    }
  }

  // Calculate adjusted total
  const discountAmount = discountApplied ? discountApplied.valueCents : 0;
  const creditAmount = referralCreditApplied ? referralCredits.creditCents : 0;
  const adjustedTotal = Math.max(0, subtotal - discountAmount - creditAmount);

  function handlePaymentSuccess(_paymentId: string) {
    // Redeem discount code if used
    if (discountApplied) {
      import("@/lib/referrals/discount-actions")
        .then(({ redeemDiscountCode }) => redeemDiscountCode(discountApplied.codeId))
        .catch(() => toast.error("Discount code could not be redeemed. Please contact us."));
    }
    // Redeem referral credit if used
    if (referralCreditApplied) {
      const creditReward = referralCredits.rewards.find(
        (r) => r.reward_type === "instant_discount" && r.reward_value_cents
      );
      if (creditReward) {
        import("@/lib/referrals/actions")
          .then(({ redeemReferralReward }) => redeemReferralReward(creditReward.id))
          .catch(() => toast.error("Referral credit could not be redeemed. Please contact us."));
      }
    }
    toast.success("Payment successful! Your booking is confirmed.");
    setStep(4);
  }

  function handlePaymentError(error: string) {
    setPaymentError(error);
    toast.error("Payment failed. Please try again or use a different card.");
  }

  function handleDownloadICS() {
    if (!session) return;
    const icsContent = generateICS(session, selectedChildren);
    const blob = new Blob([icsContent], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${session.title.replace(/\s+/g, "-")}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-lg font-semibold text-foreground">
          Session not found
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          This session may no longer be available.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          render={<Link href="/parent/book" />}
        >
          Back to Sessions
        </Button>
      </div>
    );
  }

  const spotsRemaining =
    (session.max_capacity ?? 0) - (session.current_bookings ?? 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className={`h-2 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-primary" : "bg-gray-200"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Step 1: Session Detail */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              render={<Link href="/parent/book" />}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">
              Session Details
            </h1>
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h2 className="text-xl font-semibold text-foreground">
                {session.title}
              </h2>
              <Badge className="bg-orange-50 text-primary border-orange-200">
                {session.sport}
              </Badge>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 shrink-0 text-primary" />
                <span>{formatDate(session.date)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 shrink-0 text-primary" />
                <span>
                  {formatTime(session.start_time)} &ndash;{" "}
                  {formatTime(session.end_time)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 shrink-0 text-primary" />
                <span>
                  {session.location_name}
                  {session.suburb ? `, ${session.suburb}` : ""}
                  {session.location_address ? (
                    <span className="block text-xs text-muted-foreground/70 mt-0.5">
                      {session.location_address}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 shrink-0 text-primary" />
                <span>
                  Ages {session.age_group_min}&ndash;{session.age_group_max}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <span className="text-2xl font-bold text-foreground">
                  {formatPrice(session.price_cents)}
                </span>
                <span className="text-sm text-muted-foreground ml-1">
                  per child
                </span>
              </div>
              <p
                className={`text-sm font-medium ${
                  spotsRemaining <= 0
                    ? "text-red-600"
                    : spotsRemaining <= 3
                      ? "text-amber-600"
                      : "text-green-600"
                }`}
              >
                {spotsRemaining <= 0
                  ? "Session full"
                  : `${spotsRemaining} spot${spotsRemaining !== 1 ? "s" : ""} remaining`}
              </p>
            </div>
          </div>

          <Button
            className="w-full bg-primary hover:bg-[#d4651f] h-11"
            onClick={() => setStep(2)}
          >
            Continue to Select Children
          </Button>
        </div>
      )}

      {/* Step 2: Select Children */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setStep(1)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">
              Select Children
            </h1>
          </div>

          <div className="space-y-3">
            {children.length === 0 ? (
              <div className="rounded-xl border bg-card p-6 text-center">
                <p className="text-muted-foreground">
                  No children found. Please add your children first.
                </p>
                <Button
                  variant="outline"
                  className="mt-3"
                  render={<Link href="/parent/kids" />}
                >
                  Add Children
                </Button>
              </div>
            ) : (
              children.map((child) => {
                const eligible = isChildEligible(child);
                const selected = selectedChildIds.includes(child.id);
                const age = getChildAge(child);

                return (
                  <button
                    key={child.id}
                    type="button"
                    disabled={!eligible}
                    onClick={() => toggleChild(child.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                      !eligible
                        ? "opacity-50 cursor-not-allowed bg-gray-50"
                        : selected
                          ? "border-primary bg-orange-50 ring-2 ring-primary/20"
                          : "bg-card hover:border-primary/40 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">
                          {child.first_name} {child.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {age !== null ? `${age} years old` : "Age not set"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!eligible && (
                          <span className="text-xs text-red-500">
                            Outside age range (
                            {session.age_group_min}&ndash;
                            {session.age_group_max})
                          </span>
                        )}
                        <div
                          className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                            selected
                              ? "bg-primary border-primary"
                              : "border-gray-300"
                          }`}
                        >
                          {selected && (
                            <Check className="h-4 w-4 text-white" />
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {selectedChildIds.length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedChildIds.length} child
                  {selectedChildIds.length !== 1 ? "ren" : ""} selected
                </span>
                <span className="text-lg font-bold text-foreground">
                  Subtotal: {formatPrice(subtotal)}
                </span>
              </div>
            </div>
          )}

          <Button
            className="w-full bg-primary hover:bg-[#d4651f] h-11"
            disabled={selectedChildIds.length === 0}
            onClick={() => setStep(3)}
          >
            Continue to Payment
          </Button>
        </div>
      )}

      {/* Step 3: Payment */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setStep(2)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Payment</h1>
          </div>

          {/* Order summary */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h3 className="font-semibold text-foreground">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{session.title}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{formatDate(session.date)}</span>
                <span>
                  {formatTime(session.start_time)} &ndash;{" "}
                  {formatTime(session.end_time)}
                </span>
              </div>
              <div className="border-t pt-2 mt-2">
                <p className="text-xs text-muted-foreground mb-1">Children:</p>
                {selectedChildren.map((child) => (
                  <div
                    key={child.id}
                    className="flex justify-between text-sm"
                  >
                    <span>{child.first_name} {child.last_name}</span>
                    <span>{formatPrice(session.price_cents)}</span>
                  </div>
                ))}
              </div>
              {(discountApplied || referralCreditApplied) && (
                <>
                  <div className="border-t pt-2 mt-2 flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  {discountApplied && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount ({discountCode})</span>
                      <span>-{formatPrice(discountApplied.valueCents)}</span>
                    </div>
                  )}
                  {referralCreditApplied && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Referral Credit</span>
                      <span>-{formatPrice(creditAmount)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="border-t pt-2 mt-2 flex justify-between font-semibold text-foreground">
                <span>Total</span>
                <span>{formatPrice(adjustedTotal)}</span>
              </div>
            </div>
          </div>

          {/* Discount code input */}
          {!discountApplied && (
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Have a discount code?</h3>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                  placeholder="Enter code"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApplyDiscount}
                  disabled={discountLoading || !discountCode.trim()}
                  className="border-primary text-primary hover:bg-orange-50"
                >
                  {discountLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                </Button>
              </div>
              {discountError && <p className="text-xs text-red-600">{discountError}</p>}
            </div>
          )}

          {/* Referral credits */}
          {referralCredits.creditCents > 0 && !referralCreditApplied && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">
                  You have {formatPrice(referralCredits.creditCents)} in referral credits!
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReferralCreditApplied(true)}
                className="border-green-600 text-green-700 hover:bg-green-100"
              >
                Apply Referral Credit
              </Button>
            </div>
          )}
          {referralCreditApplied && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-800">
                  Referral credit of {formatPrice(creditAmount)} applied
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReferralCreditApplied(false)}
                className="text-xs text-muted-foreground"
              >
                Remove
              </Button>
            </div>
          )}

          {/* Free session from referral milestone */}
          {referralCredits.hasFreeSession && !freeSessionApplied && adjustedTotal > 0 && (
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">
                  You have a free session from referrals!
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setFreeSessionApplied(true); }}
                className="border-purple-600 text-purple-700 hover:bg-purple-100"
              >
                Redeem Free Session
              </Button>
            </div>
          )}

          {/* Payment option: Card */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Pay with Card</h3>
            </div>
            {pendingBookingId ? (
              <SquarePayment
                amountCents={freeSessionApplied ? 0 : adjustedTotal}
                onPaymentSuccess={handlePaymentSuccess}
                onPaymentError={handlePaymentError}
                idempotencyKey={idempotencyKey}
                bookingId={pendingBookingId}
              />
            ) : (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-[#666666]" />
                <span className="ml-2 text-sm text-[#666666]">
                  Preparing payment...
                </span>
              </div>
            )}
            {paymentError && (
              <p className="mt-2 text-sm text-red-600">{paymentError}</p>
            )}
          </div>

          {/* Payment option: Session Pack */}
          {packageBalances.length > 0 && (
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <PackageIcon className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">
                  Use Session Pack
                </h3>
              </div>
              <div className="space-y-2">
                {packageBalances.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium text-sm text-foreground">
                        {pkg.package.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pkg.remaining_sessions} session
                        {pkg.remaining_sessions !== 1 ? "s" : ""} remaining
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-primary text-primary hover:bg-orange-50"
                      disabled={
                        submitting ||
                        pkg.remaining_sessions < selectedChildIds.length
                      }
                      onClick={() => handlePackageRedemption(pkg.id)}
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Use Pack"
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Confirmation */}
      {step === 4 && (
        <div className="space-y-6 text-center">
          <div className="flex flex-col items-center pt-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 mb-4">
              <Check className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Booking Confirmed!
            </h1>
            <p className="text-muted-foreground mt-1">
              You&apos;re all set. We&apos;ll see you there!
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 text-left space-y-3">
            <h3 className="font-semibold text-foreground">{session.title}</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>{formatDate(session.date)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  {formatTime(session.start_time)} &ndash;{" "}
                  {formatTime(session.end_time)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" />
                <span>{session.location_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 shrink-0" />
                <span>
                  {selectedChildren.map((c) => `${c.first_name} ${c.last_name}`).join(", ")}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleDownloadICS}
            >
              <Download className="h-4 w-4" />
              Download Calendar Invite
            </Button>
            <Button
              className="bg-primary hover:bg-[#d4651f] gap-2"
              render={<Link href="/parent/book" />}
            >
              Book Another Session
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
