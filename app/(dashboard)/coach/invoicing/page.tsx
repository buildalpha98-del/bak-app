import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCoachInvoiceForPeriod,
  getUninvoicedSessions,
  getCoachInvoiceHistory,
} from "@/lib/invoicing/actions";
import { getFortnightlyPeriodForOffset } from "@/lib/utils/invoicing";
import { getCoachInvoicingPulse } from "@/lib/coach/page-pulses";
import { InvoicingDashboard } from "@/components/invoicing/invoicing-dashboard";
import { CoachPulseStrip } from "@/components/coach/coach-pulse-strip";
import { LoadError } from "@/components/ui/load-error";

interface Props {
  searchParams: Promise<{ period?: string }>;
}

export default async function CoachInvoicingPage({ searchParams }: Props) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const periodOffset = parseInt(params.period ?? "0", 10) || 0;
  const { start, end } = getFortnightlyPeriodForOffset(periodOffset);

  const periodStart = start.toISOString().split("T")[0];
  const periodEnd = end.toISOString().split("T")[0];

  // Parallel fetches
  const [invoiceResult, sessionsResult, historyResult, profileResult, pulse] =
    await Promise.all([
      getCoachInvoiceForPeriod(periodStart, periodEnd),
      getUninvoicedSessions(periodStart, periodEnd),
      getCoachInvoiceHistory(),
      supabase
        .from("profiles")
        .select("name, email, phone, address, abn, gst_registered")
        .eq("id", user.id)
        .single(),
      getCoachInvoicingPulse(user.id, periodStart, periodEnd),
    ]);

  const firstError = invoiceResult.error || sessionsResult.error || historyResult.error || profileResult.error;
  if (firstError) {
    return (
      <LoadError message="Failed to load page data. Please try refreshing." />
    );
  }

  const coachProfile = profileResult.data ?? {
    name: "",
    email: user.email ?? "",
    phone: null,
    address: null,
    abn: null,
    gst_registered: false,
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <CoachPulseStrip
        items={[
          {
            icon: "receipt",
            count: pulse.unpaidCount,
            label: pulse.unpaidCount === 1 ? "unpaid" : "unpaid",
            accent: true,
          },
          {
            icon: "wallet",
            count: pulse.paidThisMonthCount,
            label: "paid this month",
          },
          {
            icon: "calendar-check",
            count: pulse.sessionsThisPeriodCount,
            label: "sessions this period",
          },
        ]}
      />
      <InvoicingDashboard
        periodOffset={periodOffset}
        periodStart={periodStart}
        periodEnd={periodEnd}
        existingInvoice={invoiceResult.data}
        uninvoicedSessions={sessionsResult.data}
        invoiceHistory={historyResult.data}
        gstRegistered={coachProfile.gst_registered}
        coachProfile={coachProfile}
      />
    </div>
  );
}
