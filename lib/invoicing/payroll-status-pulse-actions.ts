"use server";

// ============================================================
// Payroll — status pulse server action
// ============================================================
//
// Powers the inline pulse strip at the top of /admin/payroll. Four
// counts surface "what to look at first":
//
//   1. Awaiting calculation  — `payment_batches` with status='calculating'.
//      Batches where the calc job either failed or hasn't been triggered.
//   2. Awaiting approval     — `payment_batches` with status='calculated'.
//      Calculated batches that need an admin pass before pay-out.
//   3. Approved unpaid       — `payment_batches` with status='approved'.
//      Approved but not yet marked paid — the money-out trigger queue.
//   4. Paid this fortnight   — `payment_batches` with status='paid' and
//      `paid_at >= 14 days ago`. Velocity / cadence signal.

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PayrollStatusPulse {
  awaitingCalculationCount: number;
  awaitingApprovalCount: number;
  approvedUnpaidCount: number;
  paidThisFortnightCount: number;
}

export async function getPayrollStatusPulse(): Promise<PayrollStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const fortnightAgo = new Date();
    fortnightAgo.setDate(fortnightAgo.getDate() - 14);
    const fortnightAgoIso = fortnightAgo.toISOString();

    const [calculatingRes, calculatedRes, approvedRes, recentlyPaidRes] =
      await Promise.all([
        supabase
          .from("payment_batches")
          .select("id", { count: "exact", head: true })
          .eq("status", "calculating"),
        supabase
          .from("payment_batches")
          .select("id", { count: "exact", head: true })
          .eq("status", "calculated"),
        supabase
          .from("payment_batches")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved"),
        supabase
          .from("payment_batches")
          .select("id", { count: "exact", head: true })
          .eq("status", "paid")
          .gte("paid_at", fortnightAgoIso),
      ]);

    return {
      awaitingCalculationCount: calculatingRes.count ?? 0,
      awaitingApprovalCount: calculatedRes.count ?? 0,
      approvedUnpaidCount: approvedRes.count ?? 0,
      paidThisFortnightCount: recentlyPaidRes.count ?? 0,
    };
  } catch (err) {
    console.error("getPayrollStatusPulse error:", err);
    return {
      awaitingCalculationCount: 0,
      awaitingApprovalCount: 0,
      approvedUnpaidCount: 0,
      paidThisFortnightCount: 0,
    };
  }
}
