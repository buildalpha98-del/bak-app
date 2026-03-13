"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { triggerNotificationForOps } from "@/lib/notifications/send";
import type {
  OutboundInvoice,
  OutboundLineItem,
  Centre,
} from "@/lib/types/database";
import { calculateSessionAmount, formatOutboundDate } from "./utils";

// ============================================================
// Types
// ============================================================

export interface OutboundInvoicePreview {
  centreId: string;
  centreName: string;
  pricingModel: Centre["pricing_model"];
  sessionCount: number;
  totalAmount: number;
  lineItems: OutboundLineItem[];
}

export interface OutboundInvoiceWithCentre extends OutboundInvoice {
  centre_name: string;
  centre_primary_contact_email: string | null;
}

// ============================================================
// Read Actions
// ============================================================

export async function getOutboundInvoices(filters?: {
  centreId?: string;
  status?: string[];
  periodStart?: string;
  periodEnd?: string;
}): Promise<{ data: OutboundInvoiceWithCentre[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    let query = supabase
      .from("outbound_invoices")
      .select("*, centres(name, primary_contact_email)")
      .order("created_at", { ascending: false });

    if (filters?.centreId) {
      query = query.eq("centre_id", filters.centreId);
    }
    if (filters?.status && filters.status.length > 0) {
      query = query.in("status", filters.status);
    }
    if (filters?.periodStart) {
      query = query.gte("period_start", filters.periodStart);
    }
    if (filters?.periodEnd) {
      query = query.lte("period_end", filters.periodEnd);
    }

    const { data, error } = await query;
    if (error) return { data: null, error: error.message };

    const invoices = (data ?? []).map((row: Record<string, unknown>) => {
      const centre = row.centres as { name: string; primary_contact_email: string | null } | null;
      return {
        ...row,
        centre_name: centre?.name ?? "Unknown",
        centre_primary_contact_email: centre?.primary_contact_email ?? null,
        centres: undefined,
      } as OutboundInvoiceWithCentre;
    });

    return { data: invoices, error: null };
  } catch (err) {
    console.error("getOutboundInvoices:", err);
    return { data: null, error: "Failed to fetch outbound invoices." };
  }
}

export async function getOutboundInvoiceDetail(invoiceId: string): Promise<{
  data: (OutboundInvoiceWithCentre & { centre: Centre }) | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("outbound_invoices")
      .select("*, centres(*)")
      .eq("id", invoiceId)
      .single();

    if (error) return { data: null, error: error.message };

    const centre = data.centres as unknown as Centre;
    return {
      data: {
        ...data,
        centre_name: centre?.name ?? "Unknown",
        centre_primary_contact_email: centre?.primary_contact_email ?? null,
        centre,
        centres: undefined,
      } as OutboundInvoiceWithCentre & { centre: Centre },
      error: null,
    };
  } catch (err) {
    console.error("getOutboundInvoiceDetail:", err);
    return { data: null, error: "Failed to fetch invoice detail." };
  }
}

// ============================================================
// Generate Actions
// ============================================================

export async function calculateOutboundInvoices(
  periodStart: string,
  periodEnd: string
): Promise<{ data: OutboundInvoicePreview[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    // Fetch completed sessions in the period with centre and coach info
    const { data: sessions, error: sessionsError } = await admin
      .from("sessions")
      .select(
        "id, date, sport, headcount, centre_id, centres(id, name, pricing_model, agreed_rate), profiles!sessions_coach_id_fkey(name)"
      )
      .eq("status", "completed")
      .gte("date", periodStart)
      .lte("date", periodEnd);

    if (sessionsError) return { data: null, error: sessionsError.message };
    if (!sessions || sessions.length === 0) {
      return { data: [], error: null };
    }

    // Check for existing invoices that overlap this period
    const { data: existingInvoices } = await admin
      .from("outbound_invoices")
      .select("centre_id")
      .lte("period_start", periodEnd)
      .gte("period_end", periodStart);

    const existingCentreIds = new Set(
      (existingInvoices ?? []).map((inv: { centre_id: string }) => inv.centre_id)
    );

    // Group sessions by centre
    const centreMap = new Map<string, {
      centre: { id: string; name: string; pricing_model: string; agreed_rate: number | null };
      sessions: typeof sessions;
    }>();

    for (const session of sessions) {
      const centre = session.centres as unknown as {
        id: string;
        name: string;
        pricing_model: string;
        agreed_rate: number | null;
      };
      if (!centre) continue;

      // Skip centres with existing invoices
      if (existingCentreIds.has(centre.id)) continue;

      if (!centreMap.has(centre.id)) {
        centreMap.set(centre.id, { centre, sessions: [] });
      }
      centreMap.get(centre.id)!.sessions.push(session);
    }

    // Build previews
    const previews: OutboundInvoicePreview[] = [];

    for (const [centreId, { centre, sessions: centreSessions }] of centreMap) {
      const lineItems: OutboundLineItem[] = centreSessions.map((session) => {
        const coachName =
          (session.profiles as unknown as { name: string })?.name ?? "Unknown";
        const amount = calculateSessionAmount(
          centre.pricing_model as Centre["pricing_model"],
          centre.agreed_rate,
          session.headcount
        );
        const formattedDate = formatOutboundDate(session.date);
        return {
          session_id: session.id,
          date: session.date,
          sport: session.sport,
          coach_name: coachName,
          headcount: session.headcount,
          rate: centre.pricing_model === "centre_funded"
            ? (centre.agreed_rate ?? 0)
            : centre.pricing_model === "parent_funded"
            ? 10
            : 5,
          amount,
          description: `${session.sport} coaching — ${formattedDate} — Coach: ${coachName}`,
        };
      });

      const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);

      previews.push({
        centreId,
        centreName: centre.name,
        pricingModel: centre.pricing_model as Centre["pricing_model"],
        sessionCount: centreSessions.length,
        totalAmount,
        lineItems,
      });
    }

    return { data: previews, error: null };
  } catch (err) {
    console.error("calculateOutboundInvoices:", err);
    return { data: null, error: "Failed to calculate outbound invoices." };
  }
}

export async function generateOutboundInvoices(
  periodStart: string,
  periodEnd: string,
  previews: OutboundInvoicePreview[]
): Promise<{ data: { count: number } | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();
    const yearMonth = periodStart.substring(0, 7).replace("-", "");

    const invoices = [];

    for (const preview of previews) {
      // Get next invoice number atomically
      const { data: numberResult } = await admin.rpc(
        "next_outbound_invoice_number",
        { year_month: yearMonth }
      );

      const invoiceNumber = numberResult as string;

      invoices.push({
        centre_id: preview.centreId,
        period_start: periodStart,
        period_end: periodEnd,
        line_items_json: preview.lineItems,
        amount: preview.totalAmount,
        status: "draft" as const,
        invoice_number: invoiceNumber,
        created_by: user.id,
      });
    }

    const { error: insertError } = await admin
      .from("outbound_invoices")
      .insert(invoices);

    if (insertError) return { data: null, error: insertError.message };

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoices_generated",
      entity_type: "outbound_invoice",
      metadata: {
        period: `${periodStart} to ${periodEnd}`,
        count: invoices.length,
        total_amount: invoices.reduce((sum, inv) => sum + inv.amount, 0),
      },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    return { data: { count: invoices.length }, error: null };
  } catch (err) {
    console.error("generateOutboundInvoices:", err);
    return { data: null, error: "Failed to generate outbound invoices." };
  }
}

// ============================================================
// Edit / Workflow Actions
// ============================================================

export async function updateOutboundLineItems(
  invoiceId: string,
  lineItems: OutboundLineItem[]
): Promise<{ data: boolean | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const newTotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

    const { error } = await supabase
      .from("outbound_invoices")
      .update({
        line_items_json: lineItems as unknown as Record<string, unknown>[],
        amount: newTotal,
      })
      .eq("id", invoiceId)
      .eq("status", "draft"); // Only allow editing drafts

    if (error) return { data: null, error: error.message };

    revalidatePath(`/ops/invoicing/outbound/${invoiceId}`);
    return { data: true, error: null };
  } catch (err) {
    console.error("updateOutboundLineItems:", err);
    return { data: null, error: "Failed to update line items." };
  }
}

export async function submitForApproval(invoiceId: string): Promise<{
  data: boolean | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    const { data: invoice, error: fetchError } = await admin
      .from("outbound_invoices")
      .select("invoice_number, centres(name)")
      .eq("id", invoiceId)
      .eq("status", "draft")
      .single();

    if (fetchError || !invoice) {
      return { data: null, error: "Invoice not found or not in draft status." };
    }

    const { error: updateError } = await admin
      .from("outbound_invoices")
      .update({ status: "pending_approval" })
      .eq("id", invoiceId);

    if (updateError) return { data: null, error: updateError.message };

    const centreName =
      (invoice.centres as unknown as { name: string })?.name ?? "Unknown";

    // Notify admins specifically (they approve invoices)
    const { data: admins } = await admin
      .from("profiles")
      .select("id, email, name, role")
      .eq("role", "admin")
      .eq("status", "active");

    if (admins && admins.length > 0) {
      const { triggerNotification } = await import("@/lib/notifications/send");
      await triggerNotification(
        {
          type: "invoice_status_changed",
          title: "Outbound invoice pending approval",
          body: `Invoice ${invoice.invoice_number} for ${centreName} is ready for review.`,
          entityType: "outbound_invoice",
          entityId: invoiceId,
        },
        admins.map((a) => ({ userId: a.id, email: a.email, name: a.name, role: a.role }))
      );
    }

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoice_submitted",
      entity_type: "outbound_invoice",
      entity_id: invoiceId,
      metadata: {
        invoice_number: invoice.invoice_number,
        centre_name: centreName,
      },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    return { data: true, error: null };
  } catch (err) {
    console.error("submitForApproval:", err);
    return { data: null, error: "Failed to submit invoice for approval." };
  }
}

export async function approveInvoice(invoiceId: string): Promise<{
  data: boolean | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    const { error: updateError } = await admin
      .from("outbound_invoices")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .eq("status", "pending_approval");

    if (updateError) return { data: null, error: updateError.message };

    const { data: invoice } = await admin
      .from("outbound_invoices")
      .select("invoice_number")
      .eq("id", invoiceId)
      .single();

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoice_approved",
      entity_type: "outbound_invoice",
      entity_id: invoiceId,
      metadata: {
        invoice_number: invoice?.invoice_number,
        approved_by: user.id,
      },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    return { data: true, error: null };
  } catch (err) {
    console.error("approveInvoice:", err);
    return { data: null, error: "Failed to approve invoice." };
  }
}

export async function rejectInvoice(
  invoiceId: string,
  reason: string
): Promise<{ data: boolean | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    const { error: updateError } = await admin
      .from("outbound_invoices")
      .update({ status: "draft" })
      .eq("id", invoiceId)
      .eq("status", "pending_approval");

    if (updateError) return { data: null, error: updateError.message };

    const { data: invoice } = await admin
      .from("outbound_invoices")
      .select("invoice_number, centres(name)")
      .eq("id", invoiceId)
      .single();

    const centreName =
      (invoice?.centres as unknown as { name: string })?.name ?? "Unknown";

    // Notify ops
    await triggerNotificationForOps({
      type: "invoice_status_changed",
      title: "Outbound invoice rejected",
      body: `Invoice ${invoice?.invoice_number} for ${centreName} was rejected: ${reason}`,
      entityType: "outbound_invoice",
      entityId: invoiceId,
    });

    // Log activity with rejection reason
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoice_rejected",
      entity_type: "outbound_invoice",
      entity_id: invoiceId,
      metadata: {
        invoice_number: invoice?.invoice_number,
        reason,
      },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    return { data: true, error: null };
  } catch (err) {
    console.error("rejectInvoice:", err);
    return { data: null, error: "Failed to reject invoice." };
  }
}
