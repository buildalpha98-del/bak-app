"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { calculateGST, generateInvoiceNumber } from "@/lib/utils/invoicing";
import { triggerNotification } from "@/lib/notifications/send";
import type { CoachInvoice, PaymentBatch, InvoiceLineItem } from "@/lib/types/database";
import type { RateUnit } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

export interface PaymentBatchWithStats extends PaymentBatch {
  created_by_name: string | null;
}

export interface BatchInvoiceRow extends CoachInvoice {
  coach_name: string;
  coach_email: string;
  total_sessions: number;
  total_hours: number;
  subtotal: number;
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated.", user: null };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return { error: "Admin access required.", user: null };
  }
  return { error: null, user };
}

// ============================================================
// 1. Create or get payment batch for a period
// ============================================================

export async function createOrGetPaymentBatch(input: {
  periodStart: string;
  periodEnd: string;
}): Promise<{ data: PaymentBatch | null; error: string | null }> {
  try {
    const { error: authError, user } = await requireAdmin();
    if (authError || !user) return { data: null, error: authError };
    const supabase = await createSupabaseServerClient();

    // Check if batch already exists
    const { data: existing } = await supabase
      .from("payment_batches")
      .select("*")
      .eq("period_start", input.periodStart)
      .eq("period_end", input.periodEnd)
      .maybeSingle();

    if (existing) return { data: existing, error: null };

    // Create new batch
    const { data, error } = await supabase
      .from("payment_batches")
      .insert({
        period_start: input.periodStart,
        period_end: input.periodEnd,
        status: "calculating",
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    revalidatePath("/admin/payroll");
    return { data, error: null };
  } catch (err) {
    console.error("createOrGetPaymentBatch error:", err);
    return { data: null, error: "Failed to create payment batch." };
  }
}

// ============================================================
// 2. Calculate all coach payments for a batch
// ============================================================

export async function calculatePeriodPayroll(input: {
  batchId: string;
}): Promise<{
  data: { invoicesCreated: number; totalAmount: number } | null;
  error: string | null;
}> {
  try {
    const { error: authError, user } = await requireAdmin();
    if (authError || !user) return { data: null, error: authError };
    const admin = createSupabaseAdmin();

    // Get batch
    const { data: batch } = await admin
      .from("payment_batches")
      .select("*")
      .eq("id", input.batchId)
      .single();

    if (!batch) return { data: null, error: "Batch not found." };
    if (batch.status !== "calculating") {
      return { data: null, error: `Batch is in status "${batch.status}" — cannot recalculate.` };
    }

    // Find all completed sessions in period (admin client bypasses RLS)
    const { data: sessions } = await admin
      .from("sessions")
      .select(
        "id, date, time, sport, duration_minutes, actual_duration_minutes, pay_rate_override, pay_rate_resolved, coach_id, centre_id, centres(name)"
      )
      .eq("status", "completed")
      .gte("date", batch.period_start)
      .lte("date", batch.period_end)
      .not("coach_id", "is", null);

    if (!sessions || sessions.length === 0) {
      return { data: { invoicesCreated: 0, totalAmount: 0 }, error: null };
    }

    // Find sessions already invoiced (to avoid double-billing)
    const { data: existingInvoices } = await admin
      .from("coach_invoices")
      .select("line_items_json");

    const invoicedSessionIds = new Set<string>();
    for (const inv of existingInvoices ?? []) {
      const items = inv.line_items_json as InvoiceLineItem[] | null;
      for (const item of items ?? []) invoicedSessionIds.add(item.session_id);
    }

    // Group sessions by coach
    const sessionsByCoach: Record<string, typeof sessions> = {};
    for (const s of sessions) {
      if (invoicedSessionIds.has(s.id)) continue;
      if (!s.coach_id) continue;
      if (!sessionsByCoach[s.coach_id]) sessionsByCoach[s.coach_id] = [];
      sessionsByCoach[s.coach_id].push(s);
    }

    const coachIds = Object.keys(sessionsByCoach);
    if (coachIds.length === 0) {
      // Mark as calculated even with zero — avoid sticky 'calculating' state
      await admin
        .from("payment_batches")
        .update({
          status: "calculated",
          calculated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          coach_count: 0,
          total_amount: 0,
        })
        .eq("id", input.batchId);
      return { data: { invoicesCreated: 0, totalAmount: 0 }, error: null };
    }

    // Fetch pay rates for all coaches
    const { data: allPayRates } = await admin
      .from("pay_rates")
      .select("user_id, session_type, rate, rate_unit, effective_from")
      .in("user_id", coachIds);

    // Fetch coach profiles for GST + default rate
    const { data: coachProfiles } = await admin
      .from("profiles")
      .select("id, name, email, gst_registered, default_pay_rate")
      .in("id", coachIds);

    type CoachProfileRow = {
      id: string;
      name: string | null;
      email: string;
      gst_registered: boolean;
      default_pay_rate: number | null;
    };
    const coachProfileMap: Record<string, CoachProfileRow> = {};
    for (const p of (coachProfiles ?? []) as CoachProfileRow[]) coachProfileMap[p.id] = p;

    // Get current invoice sequence for the period
    const yearMonth = batch.period_start.slice(0, 7).replace("-", "");
    const { count: existingCount } = await admin
      .from("coach_invoices")
      .select("id", { count: "exact", head: true })
      .like("invoice_number", `BAK-COACH-${yearMonth}-%`);

    let seq = (existingCount ?? 0);
    let totalCreated = 0;
    let totalAmount = 0;

    // Generate invoice per coach
    for (const coachId of coachIds) {
      const coachSessions = sessionsByCoach[coachId];
      const profile = coachProfileMap[coachId];
      const coachRates = (allPayRates ?? []).filter((r) => r.user_id === coachId);

      const lineItems: InvoiceLineItem[] = [];

      for (const s of coachSessions) {
        const centreName = (s.centres as unknown as { name: string } | null)?.name ?? "Unknown";
        const duration = (s.actual_duration_minutes as number | null) ?? s.duration_minutes;
        const resolvedRate = (s.pay_rate_resolved as number) ?? profile?.default_pay_rate ?? 0;

        // Determine rate unit
        let rateUnit: RateUnit = "per_session";
        if (!s.pay_rate_override) {
          const matchingRate = coachRates.find((r) => r.effective_from <= s.date);
          if (matchingRate) rateUnit = matchingRate.rate_unit as RateUnit;
        }

        let amount = resolvedRate;
        if (resolvedRate > 0) {
          if (rateUnit === "per_hour") {
            amount = Math.round(resolvedRate * (duration / 60) * 100) / 100;
          } else {
            amount = resolvedRate;
          }
        }

        lineItems.push({
          session_id: s.id,
          date: s.date,
          centre_name: centreName,
          sport: s.sport,
          duration_minutes: duration,
          rate: resolvedRate,
          rate_unit: rateUnit,
          amount,
        });
      }

      if (lineItems.length === 0) continue;

      const subtotal = Math.round(lineItems.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
      const gstRegistered = profile?.gst_registered ?? false;
      const { gstAmount, total } = calculateGST(subtotal, gstRegistered);

      seq++;
      const invoiceNumber = generateInvoiceNumber(yearMonth, seq);

      const { error: insertError } = await admin
        .from("coach_invoices")
        .insert({
          coach_id: coachId,
          invoice_number: invoiceNumber,
          period_start: batch.period_start,
          period_end: batch.period_end,
          line_items_json: lineItems,
          total_amount: total,
          gst_amount: gstAmount,
          status: "draft",
          initiated_by_role: "admin",
          payment_batch_id: batch.id,
          generated_by: user.id,
        });

      if (insertError) {
        console.error(`Failed to insert invoice for coach ${coachId}:`, insertError);
        continue;
      }

      totalCreated++;
      totalAmount += total;
    }

    // Update batch
    await admin
      .from("payment_batches")
      .update({
        status: "calculated",
        calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        coach_count: totalCreated,
        total_amount: Math.round(totalAmount * 100) / 100,
      })
      .eq("id", input.batchId);

    revalidatePath("/admin/payroll");
    revalidatePath(`/admin/payroll/${input.batchId}`);

    return {
      data: { invoicesCreated: totalCreated, totalAmount: Math.round(totalAmount * 100) / 100 },
      error: null,
    };
  } catch (err) {
    console.error("calculatePeriodPayroll error:", err);
    return { data: null, error: "Failed to calculate payroll." };
  }
}

// ============================================================
// 3. Adjust a single invoice (bonus/deduction)
// ============================================================

export async function adjustInvoice(input: {
  invoiceId: string;
  adjustments: number;
  reason: string;
}): Promise<{ error: string | null }> {
  try {
    const { error: authError, user } = await requireAdmin();
    if (authError || !user) return { error: authError };
    const admin = createSupabaseAdmin();

    // Get current invoice
    const { data: invoice } = await admin
      .from("coach_invoices")
      .select("*, line_items_json, gst_amount")
      .eq("id", input.invoiceId)
      .single();

    if (!invoice) return { error: "Invoice not found." };

    const subtotal = Math.round(
      (invoice.line_items_json as InvoiceLineItem[]).reduce((s, i) => s + i.amount, 0) * 100
    ) / 100;
    const newSubtotal = Math.round((subtotal + input.adjustments) * 100) / 100;

    const { data: profile } = await admin
      .from("profiles").select("gst_registered").eq("id", invoice.coach_id).single();
    const { gstAmount, total } = calculateGST(newSubtotal, profile?.gst_registered ?? false);

    const { error: updateError } = await admin
      .from("coach_invoices")
      .update({
        adjustments: input.adjustments,
        adjustment_reason: input.reason,
        gst_amount: gstAmount,
        total_amount: total,
      })
      .eq("id", input.invoiceId);

    if (updateError) return { error: updateError.message };

    // Recalculate batch total if invoice is in a batch
    if (invoice.payment_batch_id) {
      const { data: batchInvoices } = await admin
        .from("coach_invoices")
        .select("total_amount")
        .eq("payment_batch_id", invoice.payment_batch_id);

      const batchTotal = (batchInvoices ?? []).reduce((s, i) => s + Number(i.total_amount), 0);
      await admin
        .from("payment_batches")
        .update({ total_amount: Math.round(batchTotal * 100) / 100, updated_at: new Date().toISOString() })
        .eq("id", invoice.payment_batch_id);
    }

    revalidatePath("/admin/payroll");
    return { error: null };
  } catch (err) {
    console.error("adjustInvoice error:", err);
    return { error: "Failed to adjust invoice." };
  }
}

// ============================================================
// 4. Approve batch — generate PDFs, send emails
// ============================================================

export async function approvePaymentBatch(input: {
  batchId: string;
}): Promise<{ data: { approved: number } | null; error: string | null }> {
  try {
    const { error: authError, user } = await requireAdmin();
    if (authError || !user) return { data: null, error: authError };
    const admin = createSupabaseAdmin();

    const { data: batch } = await admin
      .from("payment_batches")
      .select("*")
      .eq("id", input.batchId)
      .single();

    if (!batch) return { data: null, error: "Batch not found." };
    if (batch.status !== "calculated") {
      return { data: null, error: `Batch must be in 'calculated' status. Current: ${batch.status}` };
    }

    // Get all invoices in batch with coach details
    const { data: invoices } = await admin
      .from("coach_invoices")
      .select("id, coach_id, status")
      .eq("payment_batch_id", input.batchId);

    if (!invoices || invoices.length === 0) {
      return { data: null, error: "No invoices in batch." };
    }

    let approvedCount = 0;

    // Mark each invoice as 'sent' (ready for payment)
    for (const inv of invoices) {
      if (inv.status !== "draft") continue;

      await admin
        .from("coach_invoices")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", inv.id);

      // Notify coach
      const { data: coach } = await admin
        .from("profiles")
        .select("id, email, name, role")
        .eq("id", inv.coach_id)
        .single();

      if (coach) {
        await triggerNotification(
          {
            type: "coach_payment_ready",
            title: "Payment Summary Ready",
            body: `Your payment summary for the period ${batch.period_start} to ${batch.period_end} is ready.`,
            entityType: "coach_invoice",
            entityId: inv.id,
          },
          [{ userId: coach.id, email: coach.email, name: coach.name, role: coach.role }]
        );
      }

      approvedCount++;
    }

    // Update batch
    await admin
      .from("payment_batches")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.batchId);

    revalidatePath("/admin/payroll");
    revalidatePath(`/admin/payroll/${input.batchId}`);

    return { data: { approved: approvedCount }, error: null };
  } catch (err) {
    console.error("approvePaymentBatch error:", err);
    return { data: null, error: "Failed to approve batch." };
  }
}

// ============================================================
// 5. Mark entire batch as paid
// ============================================================

export async function markBatchAsPaid(input: {
  batchId: string;
  paymentDate: string;
  paymentMethod: "bank_transfer" | "other";
  paymentReference?: string;
}): Promise<{ data: { markedPaid: number } | null; error: string | null }> {
  try {
    const { error: authError, user } = await requireAdmin();
    if (authError || !user) return { data: null, error: authError };
    const admin = createSupabaseAdmin();

    const { data: batch } = await admin
      .from("payment_batches")
      .select("*")
      .eq("id", input.batchId)
      .single();

    if (!batch) return { data: null, error: "Batch not found." };

    // Update all invoices in batch
    const { data: updated, error: updateError } = await admin
      .from("coach_invoices")
      .update({
        status: "paid",
        payment_date: input.paymentDate,
        payment_method: input.paymentMethod,
        payment_reference: input.paymentReference ?? null,
      })
      .eq("payment_batch_id", input.batchId)
      .neq("status", "paid")
      .select("id");

    if (updateError) return { data: null, error: updateError.message };

    // Update batch
    await admin
      .from("payment_batches")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.batchId);

    revalidatePath("/admin/payroll");
    revalidatePath(`/admin/payroll/${input.batchId}`);

    return { data: { markedPaid: updated?.length ?? 0 }, error: null };
  } catch (err) {
    console.error("markBatchAsPaid error:", err);
    return { data: null, error: "Failed to mark batch as paid." };
  }
}

// ============================================================
// 6. List all payment batches
// ============================================================

export async function getPaymentBatches(): Promise<{
  data: PaymentBatchWithStats[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: batches, error } = await supabase
      .from("payment_batches")
      .select("*")
      .order("period_start", { ascending: false });

    if (error) return { data: [], error: error.message };
    if (!batches || batches.length === 0) return { data: [], error: null };

    // Batch-fetch creator names
    const creatorIds = [...new Set(batches.map((b) => b.created_by).filter(Boolean))] as string[];
    const creatorMap: Record<string, string> = {};

    if (creatorIds.length > 0) {
      const { data: creators } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", creatorIds);
      for (const c of creators ?? []) creatorMap[c.id] = c.name ?? "Unknown";
    }

    const enriched: PaymentBatchWithStats[] = batches.map((b) => ({
      ...b,
      created_by_name: b.created_by ? (creatorMap[b.created_by] ?? null) : null,
    }));

    return { data: enriched, error: null };
  } catch (err) {
    console.error("getPaymentBatches error:", err);
    return { data: [], error: "Failed to load payment batches." };
  }
}

// ============================================================
// 7. Get batch detail with all invoices
// ============================================================

export async function getBatchDetail(batchId: string): Promise<{
  data: { batch: PaymentBatch; invoices: BatchInvoiceRow[] } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: batch, error: batchError } = await supabase
      .from("payment_batches")
      .select("*")
      .eq("id", batchId)
      .single();

    if (batchError || !batch) {
      return { data: null, error: batchError?.message ?? "Batch not found." };
    }

    const { data: invoices, error: invError } = await supabase
      .from("coach_invoices")
      .select("*")
      .eq("payment_batch_id", batchId)
      .order("created_at", { ascending: true });

    if (invError) return { data: null, error: invError.message };

    // Batch-fetch coach profiles
    const coachIds = [...new Set((invoices ?? []).map((i) => i.coach_id))];
    const coachMap: Record<string, { name: string; email: string }> = {};

    if (coachIds.length > 0) {
      const { data: coaches } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", coachIds);
      for (const c of coaches ?? []) coachMap[c.id] = { name: c.name ?? "Unknown", email: c.email };
    }

    const enriched: BatchInvoiceRow[] = (invoices ?? []).map((inv) => {
      const lineItems = (inv.line_items_json as InvoiceLineItem[]) ?? [];
      const totalHours = lineItems.reduce(
        (sum, i) => sum + (i.duration_minutes ?? 0) / 60,
        0
      );
      const subtotal = lineItems.reduce((sum, i) => sum + i.amount, 0);
      const coach = coachMap[inv.coach_id];
      return {
        ...inv,
        coach_name: coach?.name ?? "Unknown",
        coach_email: coach?.email ?? "",
        total_sessions: lineItems.length,
        total_hours: Math.round(totalHours * 10) / 10,
        subtotal: Math.round(subtotal * 100) / 100,
      };
    });

    return { data: { batch, invoices: enriched }, error: null };
  } catch (err) {
    console.error("getBatchDetail error:", err);
    return { data: null, error: "Failed to load batch detail." };
  }
}

// ============================================================
// 8. Payroll snapshot for admin dashboard
// ============================================================

export interface PayrollSnapshot {
  latestBatch: PaymentBatch | null;
  awaitingCalculation: number;
  awaitingPayment: number;
  totalPaidThisYear: number;
}

export async function getPayrollSnapshot(): Promise<{
  data: PayrollSnapshot | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Latest batch (any status)
    const { data: latest } = await supabase
      .from("payment_batches")
      .select("*")
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Counts
    const { count: awaitingCalc } = await supabase
      .from("payment_batches")
      .select("id", { count: "exact", head: true })
      .eq("status", "calculating");

    const { count: awaitingPayment } = await supabase
      .from("payment_batches")
      .select("id", { count: "exact", head: true })
      .in("status", ["calculated", "approved"]);

    // Total paid this year
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const { data: paidBatches } = await supabase
      .from("payment_batches")
      .select("total_amount")
      .eq("status", "paid")
      .gte("period_start", yearStart);

    const totalPaid = (paidBatches ?? []).reduce(
      (sum, b) => sum + Number(b.total_amount ?? 0),
      0
    );

    return {
      data: {
        latestBatch: latest,
        awaitingCalculation: awaitingCalc ?? 0,
        awaitingPayment: awaitingPayment ?? 0,
        totalPaidThisYear: Math.round(totalPaid * 100) / 100,
      },
      error: null,
    };
  } catch (err) {
    console.error("getPayrollSnapshot error:", err);
    return { data: null, error: "Failed to load payroll snapshot." };
  }
}
