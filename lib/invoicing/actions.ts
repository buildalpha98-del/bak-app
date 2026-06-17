"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  generateInvoiceNumber,
  calculateGST,
  type FlaggedItem,
} from "@/lib/utils/invoicing";
import { formatPeriod } from "@/lib/utils/payRates";
import { triggerNotificationForOps } from "@/lib/notifications/send";
import type {
  CoachInvoice,
  InvoiceLineItem,
} from "@/lib/types/database";
import type { CoachInvoiceStatus, RateUnit } from "@/lib/types/enums";
import type { EarningsSessionItem } from "@/lib/pay-rates/actions";

// ============================================================
// Types
// ============================================================

export interface InvoiceWithCoach extends CoachInvoice {
  coach_name: string;
  coach_email: string;
}

export interface CoachInvoiceProfile {
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  abn: string | null;
  gst_registered: boolean;
}

// ============================================================
// Coach-facing actions
// ============================================================

/**
 * Get existing invoice for the authenticated coach for a given period.
 */
export async function getCoachInvoiceForPeriod(
  periodStart: string,
  periodEnd: string
): Promise<{ data: CoachInvoice | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("coach_invoices")
      .select("*")
      .eq("coach_id", user.id)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    console.error("getCoachInvoiceForPeriod:", err);
    return { data: null, error: "Failed to load invoice." };
  }
}

/**
 * Get completed sessions that haven't been included in any invoice yet.
 */
export async function getUninvoicedSessions(
  periodStart: string,
  periodEnd: string
): Promise<{ data: EarningsSessionItem[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not authenticated." };

    // Get completed sessions in the period
    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select(
        "id, date, time, sport, duration_minutes, actual_duration_minutes, pay_rate_override, pay_rate_resolved, centre_id, centres(name)"
      )
      .eq("coach_id", user.id)
      .eq("status", "completed")
      .gte("date", periodStart)
      .lte("date", periodEnd)
      .order("date", { ascending: true });

    if (sessErr) return { data: [], error: sessErr.message };

    // Get session IDs already in invoices for this coach
    const { data: existingInvoices } = await supabase
      .from("coach_invoices")
      .select("line_items_json")
      .eq("coach_id", user.id);

    const invoicedSessionIds = new Set<string>();
    for (const inv of existingInvoices ?? []) {
      const items = inv.line_items_json as InvoiceLineItem[] | null;
      for (const item of items ?? []) {
        invoicedSessionIds.add(item.session_id);
      }
    }

    // Fetch coach rates for rate_unit resolution
    const { data: payRates } = await supabase
      .from("pay_rates")
      .select("session_type, rate, rate_unit, effective_from")
      .eq("user_id", user.id);

    // Filter out already-invoiced sessions and build items
    const uninvoiced: EarningsSessionItem[] = [];
    for (const s of sessions ?? []) {
      if (invoicedSessionIds.has(s.id)) continue;

      const centreName =
        (s.centres as unknown as { name: string } | null)?.name ?? "Unknown";
      const duration =
        (s.actual_duration_minutes as number | null) ?? s.duration_minutes;
      const resolvedRate = (s.pay_rate_resolved as number) ?? 0;
      let amount = resolvedRate;
      let rateUnit: RateUnit = "per_session";

      if (s.pay_rate_override) {
        amount = s.pay_rate_override;
        rateUnit = "per_session";
      } else {
        const matchingRate = (payRates ?? []).find(
          (r) => r.effective_from <= s.date
        );
        if (matchingRate) {
          rateUnit = matchingRate.rate_unit;
        }
      }

      if (resolvedRate > 0) {
        if (rateUnit === "per_hour") {
          amount = Math.round(resolvedRate * (duration / 60) * 100) / 100;
        } else {
          amount = resolvedRate;
        }
      }

      uninvoiced.push({
        id: s.id,
        date: s.date,
        time: s.time,
        sport: s.sport,
        centre_name: centreName,
        duration_minutes: duration,
        pay_rate_resolved: resolvedRate > 0 ? resolvedRate : null,
        rate_unit: rateUnit,
        amount,
      });
    }

    return { data: uninvoiced, error: null };
  } catch (err) {
    console.error("getUninvoicedSessions:", err);
    return { data: [], error: "Failed to load sessions." };
  }
}

/**
 * Generate a new draft invoice for the given period.
 */
export async function generateCoachInvoice(
  periodStart: string,
  periodEnd: string
): Promise<{ data: CoachInvoice | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Check no existing invoice for this period
    const { data: existing } = await supabase
      .from("coach_invoices")
      .select("id")
      .eq("coach_id", user.id)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .maybeSingle();

    if (existing) {
      return { data: null, error: "Invoice already exists for this period." };
    }

    // Get uninvoiced sessions
    const { data: sessions, error: sessErr } = await getUninvoicedSessions(
      periodStart,
      periodEnd
    );
    if (sessErr) return { data: null, error: sessErr };
    if (!sessions || sessions.length === 0) {
      return { data: null, error: "No uninvoiced sessions for this period." };
    }

    // Get coach profile for GST
    const { data: profile } = await supabase
      .from("profiles")
      .select("gst_registered")
      .eq("id", user.id)
      .single();

    const gstRegistered = profile?.gst_registered ?? false;

    // Build line items
    const lineItems: InvoiceLineItem[] = sessions.map((s) => ({
      session_id: s.id,
      date: s.date,
      centre_name: s.centre_name,
      sport: s.sport,
      duration_minutes: s.duration_minutes,
      rate: s.pay_rate_resolved ?? 0,
      rate_unit: s.rate_unit,
      amount: s.amount,
    }));

    const subtotal = Math.round(
      lineItems.reduce((sum, item) => sum + item.amount, 0) * 100
    ) / 100;
    const { gstAmount, total } = calculateGST(subtotal, gstRegistered);

    // Generate invoice number
    const yearMonth = periodStart.slice(0, 7).replace("-", "");
    const { count } = await supabase
      .from("coach_invoices")
      .select("id", { count: "exact", head: true })
      .like("invoice_number", `BAK-COACH-${yearMonth}-%`);

    const seq = (count ?? 0) + 1;
    const invoiceNumber = generateInvoiceNumber(yearMonth, seq);

    // Insert invoice
    const { data: invoice, error: insertErr } = await supabase
      .from("coach_invoices")
      .insert({
        coach_id: user.id,
        invoice_number: invoiceNumber,
        period_start: periodStart,
        period_end: periodEnd,
        line_items_json: lineItems,
        total_amount: total,
        gst_amount: gstAmount,
        status: "draft" as CoachInvoiceStatus,
      })
      .select()
      .single();

    if (insertErr) return { data: null, error: insertErr.message };

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "invoice_generated",
      entity_type: "coach_invoice",
      entity_id: invoice.id,
      metadata: {
        invoice_number: invoiceNumber,
        period: `${periodStart} to ${periodEnd}`,
        total: total,
        session_count: lineItems.length,
      },
    });

    revalidatePath("/coach/invoicing");
    return { data: invoice, error: null };
  } catch (err) {
    console.error("generateCoachInvoice:", err);
    return { data: null, error: "Failed to generate invoice." };
  }
}

/**
 * Flag line items on a draft invoice for ops review.
 */
export async function flagInvoiceItems(
  invoiceId: string,
  flaggedItems: FlaggedItem[]
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Verify ownership and status
    const { data: invoice } = await supabase
      .from("coach_invoices")
      .select("id, status, invoice_number")
      .eq("id", invoiceId)
      .eq("coach_id", user.id)
      .single();

    if (!invoice) return { error: "Invoice not found." };
    if (invoice.status !== "draft") {
      return { error: "Can only flag items on draft invoices." };
    }

    const { error } = await supabase
      .from("coach_invoices")
      .update({
        flagged_items_json: flaggedItems,
        status: "flagged" as CoachInvoiceStatus,
      })
      .eq("id", invoiceId);

    if (error) return { error: error.message };

    // Notify ops
    await triggerNotificationForOps({
      type: "invoice_status_changed",
      title: "Invoice flagged for review",
      body: `A coach has flagged ${flaggedItems.length} item(s) on invoice ${invoice.invoice_number}.`,
      entityType: "coach_invoice",
      entityId: invoiceId,
    });

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "invoice_flagged",
      entity_type: "coach_invoice",
      entity_id: invoiceId,
      metadata: { flagged_count: flaggedItems.length },
    });

    revalidatePath("/coach/invoicing");
    revalidatePath("/ops/invoicing");
    return { error: null };
  } catch (err) {
    console.error("flagInvoiceItems:", err);
    return { error: "Failed to flag items." };
  }
}

/**
 * Send a coach invoice — generates PDF, stores it, and emails admin.
 */
export async function sendCoachInvoice(
  invoiceId: string
): Promise<{ data: { pdf_url: string } | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Verify ownership and status
    const { data: invoice } = await supabase
      .from("coach_invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("coach_id", user.id)
      .single();

    if (!invoice) return { data: null, error: "Invoice not found." };
    if (invoice.status !== "draft" && invoice.status !== "ready") {
      return { data: null, error: "Invoice cannot be sent in its current status." };
    }

    // Get coach profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, email, phone, address, abn, gst_registered")
      .eq("id", user.id)
      .single();

    if (!profile) return { data: null, error: "Profile not found." };

    // Generate PDF via API route
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const pdfResponse = await fetch(`${baseUrl}/api/invoicing/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId }),
    });

    if (!pdfResponse.ok) {
      return { data: null, error: "Failed to generate PDF." };
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    const storagePath = `${user.id}/${invoice.invoice_number}.pdf`;

    // Upload to Supabase Storage
    const { error: uploadErr } = await supabase.storage
      .from("invoices")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Storage upload error:", uploadErr);
      return { data: null, error: "Failed to store PDF." };
    }

    const { data: urlData } = supabase.storage
      .from("invoices")
      .getPublicUrl(storagePath);

    const pdfUrl = urlData.publicUrl;

    // Email PDF to admin
    const { sendEmailWithAttachment } = await import("@/lib/email/send");
    const { invoiceSentToAdminEmail } = await import("@/lib/email/templates");

    // Get admin email(s)
    const { data: admins } = await supabase
      .from("profiles")
      .select("email")
      .in("role", ["admin", "ops"])
      .eq("status", "active");

    const periodLabel = formatPeriod(
      new Date(invoice.period_start),
      new Date(invoice.period_end)
    );
    const template = invoiceSentToAdminEmail(
      profile.name,
      invoice.invoice_number ?? "",
      periodLabel,
      `$${invoice.total_amount.toFixed(2)}`
    );

    for (const admin of admins ?? []) {
      await sendEmailWithAttachment(admin.email, template.subject, template.html, {
        filename: `${invoice.invoice_number}.pdf`,
        content: pdfBuffer,
      });
    }

    // Update invoice
    const { error: updateErr } = await supabase
      .from("coach_invoices")
      .update({
        pdf_url: pdfUrl,
        status: "sent" as CoachInvoiceStatus,
        sent_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (updateErr) return { data: null, error: updateErr.message };

    // Notify ops
    await triggerNotificationForOps({
      type: "invoice_status_changed",
      title: "Coach invoice received",
      body: `${profile.name} sent invoice ${invoice.invoice_number} for ${periodLabel}.`,
      entityType: "coach_invoice",
      entityId: invoiceId,
    });

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "invoice_sent",
      entity_type: "coach_invoice",
      entity_id: invoiceId,
      metadata: { invoice_number: invoice.invoice_number, pdf_url: pdfUrl },
    });

    revalidatePath("/coach/invoicing");
    revalidatePath("/admin/invoicing");
    revalidatePath("/ops/invoicing");
    return { data: { pdf_url: pdfUrl }, error: null };
  } catch (err) {
    console.error("sendCoachInvoice:", err);
    return { data: null, error: "Failed to send invoice." };
  }
}

/**
 * Get all invoices for the authenticated coach.
 */
export async function getCoachInvoiceHistory(): Promise<{
  data: CoachInvoice[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not authenticated." };

    const { data, error } = await supabase
      .from("coach_invoices")
      .select("*")
      .eq("coach_id", user.id)
      .order("period_start", { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getCoachInvoiceHistory:", err);
    return { data: [], error: "Failed to load invoice history." };
  }
}

// ============================================================
// Ops/Admin-facing actions
// ============================================================

/**
 * Get all flagged invoices with coach details (for ops review).
 */
export async function getFlaggedInvoices(): Promise<{
  data: InvoiceWithCoach[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not authenticated." };

    const { data, error } = await supabase
      .from("coach_invoices")
      .select("*, profiles!coach_invoices_coach_id_fkey(name, email)")
      .eq("status", "flagged")
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: error.message };

    const invoices: InvoiceWithCoach[] = (data ?? []).map(
      (row: Record<string, unknown>) => {
        const profile = row.profiles as { name: string; email: string } | null;
        const { profiles: _, ...rest } = row;
        return {
          ...rest,
          coach_name: profile?.name ?? "Unknown",
          coach_email: profile?.email ?? "",
        } as InvoiceWithCoach;
      }
    );

    return { data: invoices, error: null };
  } catch (err) {
    console.error("getFlaggedInvoices:", err);
    return { data: [], error: "Failed to load flagged invoices." };
  }
}

/**
 * Resolve flagged items on an invoice — update line items and mark as ready.
 */
export async function resolveInvoiceFlags(
  invoiceId: string,
  updatedLineItems: InvoiceLineItem[],
  resolutionNote: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Verify role
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || !["admin", "ops"].includes(callerProfile.role)) {
      return { error: "Insufficient permissions." };
    }

    // Fetch invoice for coach profile (to recalculate GST)
    const { data: invoice } = await supabase
      .from("coach_invoices")
      .select("id, coach_id, invoice_number, status")
      .eq("id", invoiceId)
      .single();

    if (!invoice) return { error: "Invoice not found." };
    if (invoice.status !== "flagged") {
      return { error: "Invoice is not in flagged status." };
    }

    const { data: coachProfile } = await supabase
      .from("profiles")
      .select("gst_registered, name")
      .eq("id", invoice.coach_id)
      .single();

    const gstRegistered = coachProfile?.gst_registered ?? false;
    const subtotal = Math.round(
      updatedLineItems.reduce((sum, item) => sum + item.amount, 0) * 100
    ) / 100;
    const { gstAmount, total } = calculateGST(subtotal, gstRegistered);

    const { error } = await supabase
      .from("coach_invoices")
      .update({
        line_items_json: updatedLineItems,
        total_amount: total,
        gst_amount: gstAmount,
        flagged_items_json: null,
        status: "ready" as CoachInvoiceStatus,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (error) return { error: error.message };

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "invoice_flags_resolved",
      entity_type: "coach_invoice",
      entity_id: invoiceId,
      metadata: { resolution_note: resolutionNote },
    });

    revalidatePath("/coach/invoicing");
    revalidatePath("/ops/invoicing");
    return { error: null };
  } catch (err) {
    console.error("resolveInvoiceFlags:", err);
    return { error: "Failed to resolve flags." };
  }
}

/**
 * Get all coach invoices with optional filters (admin/ops).
 */
export async function getAllCoachInvoices(filters?: {
  coachId?: string;
  status?: CoachInvoiceStatus;
}): Promise<{
  data: InvoiceWithCoach[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not authenticated." };

    let query = supabase
      .from("coach_invoices")
      .select("*, profiles!coach_invoices_coach_id_fkey(name, email)")
      .order("created_at", { ascending: false });

    if (filters?.coachId) {
      query = query.eq("coach_id", filters.coachId);
    }
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    const { data, error } = await query;
    if (error) return { data: [], error: error.message };

    const invoices: InvoiceWithCoach[] = (data ?? []).map(
      (row: Record<string, unknown>) => {
        const profile = row.profiles as { name: string; email: string } | null;
        const { profiles: _, ...rest } = row;
        return {
          ...rest,
          coach_name: profile?.name ?? "Unknown",
          coach_email: profile?.email ?? "",
        } as InvoiceWithCoach;
      }
    );

    return { data: invoices, error: null };
  } catch (err) {
    console.error("getAllCoachInvoices:", err);
    return { data: [], error: "Failed to load invoices." };
  }
}

/**
 * Mark an invoice as paid (admin only).
 */
export async function markInvoicePaid(
  invoiceId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Verify admin role
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.role !== "admin") {
      return { error: "Only admins can mark invoices as paid." };
    }

    const { data: invoice } = await supabase
      .from("coach_invoices")
      .select("id, status, invoice_number, coach_id")
      .eq("id", invoiceId)
      .single();

    if (!invoice) return { error: "Invoice not found." };
    if (invoice.status !== "sent") {
      return { error: "Can only mark sent invoices as paid." };
    }

    const { error } = await supabase
      .from("coach_invoices")
      .update({ status: "paid" as CoachInvoiceStatus })
      .eq("id", invoiceId);

    if (error) return { error: error.message };

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "invoice_paid",
      entity_type: "coach_invoice",
      entity_id: invoiceId,
      metadata: { invoice_number: invoice.invoice_number },
    });

    revalidatePath("/admin/invoicing");
    revalidatePath("/coach/invoicing");
    return { error: null };
  } catch (err) {
    console.error("markInvoicePaid:", err);
    return { error: "Failed to mark invoice as paid." };
  }
}

/**
 * Update coach GST registration status.
 */
export async function updateCoachGSTRegistration(
  gstRegistered: boolean
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase
      .from("profiles")
      .update({ gst_registered: gstRegistered })
      .eq("id", user.id);

    if (error) return { error: error.message };

    revalidatePath("/coach/profile");
    revalidatePath("/coach/invoicing");
    return { error: null };
  } catch (err) {
    console.error("updateCoachGSTRegistration:", err);
    return { error: "Failed to update GST status." };
  }
}

// ============================================================
// Bulk actions — admin only
// ============================================================
//
// Both bulk helpers run sequentially over the supplied ids so a single
// per-row failure doesn't sink the whole batch. The shape mirrors the
// established bulk-action contract from training/programs/equipment:
//   { processed: N, errors: [{ id, error }], error: string | null }
// `error` is a top-level fatal (empty selection / role gate). Per-row
// failures land in `errors` so the UI can toast a partial summary.

export async function bulkMarkInvoicesPaid(
  invoiceIds: string[]
): Promise<{
  paid: number;
  errors: Array<{ id: string; error: string }>;
  error: string | null;
}> {
  if (invoiceIds.length === 0) {
    return { paid: 0, errors: [], error: "No invoices selected." };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { paid: 0, errors: [], error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return { paid: 0, errors: [], error: "Not authorised." };
    }

    const errors: Array<{ id: string; error: string }> = [];
    let paid = 0;

    for (const id of invoiceIds) {
      // Each invoice goes through markInvoicePaid's validations
      // (only sent → paid allowed). Errors don't sink the batch.
      const { error } = await markInvoicePaid(id);
      if (error) {
        errors.push({ id, error });
      } else {
        paid += 1;
      }
    }

    revalidatePath("/admin/invoicing");
    revalidatePath("/ops/invoicing");
    return { paid, errors, error: null };
  } catch (err) {
    console.error("bulkMarkInvoicesPaid:", err);
    return { paid: 0, errors: [], error: "Failed to mark invoices paid." };
  }
}

export async function bulkResolveFlaggedInvoices(
  invoiceIds: string[],
  resolutionNote: string
): Promise<{
  resolved: number;
  errors: Array<{ id: string; error: string }>;
  error: string | null;
}> {
  if (invoiceIds.length === 0) {
    return { resolved: 0, errors: [], error: "No invoices selected." };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { resolved: 0, errors: [], error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "ops"].includes(profile.role)) {
      return { resolved: 0, errors: [], error: "Not authorised." };
    }

    const errors: Array<{ id: string; error: string }> = [];
    let resolved = 0;

    for (const id of invoiceIds) {
      // For bulk-resolve we accept the existing line items as-is.
      // Use case: a batch of flagged invoices where the resolution
      // is "yes, these are fine" (no edits to amounts).
      const { data: invoice } = await supabase
        .from("coach_invoices")
        .select("line_items_json, status")
        .eq("id", id)
        .single();

      if (!invoice || invoice.status !== "flagged") {
        errors.push({ id, error: "Not flagged" });
        continue;
      }

      const { error } = await resolveInvoiceFlags(
        id,
        invoice.line_items_json as InvoiceLineItem[],
        resolutionNote
      );
      if (error) {
        errors.push({ id, error });
      } else {
        resolved += 1;
      }
    }

    revalidatePath("/admin/invoicing");
    revalidatePath("/ops/invoicing");
    return { resolved, errors, error: null };
  } catch (err) {
    console.error("bulkResolveFlaggedInvoices:", err);
    return { resolved: 0, errors: [], error: "Failed to resolve invoices." };
  }
}

export async function exportInvoicesCsv(invoiceIds: string[]): Promise<{
  csv: string | null;
  error: string | null;
}> {
  if (invoiceIds.length === 0) {
    return { csv: null, error: "No invoices selected." };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { csv: null, error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "ops"].includes(profile.role)) {
      return { csv: null, error: "Not authorised." };
    }

    const { data, error } = await supabase
      .from("coach_invoices")
      .select("*, profiles!coach_invoices_coach_id_fkey(name, email)")
      .in("id", invoiceIds);

    if (error) return { csv: null, error: error.message };
    if (!data || data.length === 0) {
      return { csv: null, error: "No matching invoices found." };
    }

    const headers = [
      "Invoice #",
      "Coach",
      "Email",
      "Period Start",
      "Period End",
      "Subtotal",
      "GST",
      "Total",
      "Status",
      "Sent At",
      "Created At",
    ];
    const rows = data.map((row: Record<string, unknown>) => {
      const profile = row.profiles as { name: string; email: string } | null;
      const lineItems = (row.line_items_json as InvoiceLineItem[]) ?? [];
      const subtotal = lineItems.reduce((s, i) => s + i.amount, 0);
      return [
        String(row.invoice_number ?? ""),
        profile?.name ?? "Unknown",
        profile?.email ?? "",
        String(row.period_start ?? ""),
        String(row.period_end ?? ""),
        subtotal.toFixed(2),
        Number(row.gst_amount ?? 0).toFixed(2),
        Number(row.total_amount ?? 0).toFixed(2),
        String(row.status ?? ""),
        String(row.sent_at ?? ""),
        String(row.created_at ?? ""),
      ]
        .map((c) =>
          c.includes(",") || c.includes("\n") || c.includes('"')
            ? `"${c.replace(/"/g, '""')}"`
            : c,
        )
        .join(",");
    });

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "coach_invoices_exported_csv",
      entity_type: "coach_invoice",
      entity_id: null,
      metadata: { count: data.length },
    });

    return { csv: [headers.join(","), ...rows].join("\n"), error: null };
  } catch (err) {
    console.error("exportInvoicesCsv:", err);
    return { csv: null, error: "Failed to export invoices." };
  }
}
