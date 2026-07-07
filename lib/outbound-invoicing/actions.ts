"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { triggerNotificationForOps } from "@/lib/notifications/send";
import type {
  OutboundInvoice,
  OutboundLineItem,
  Centre,
  InvoicePaymentRecord,
} from "@/lib/types/database";
import type { InvoicePaymentMethod, OutboundInvoiceStatus } from "@/lib/types/enums";
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
      } as unknown as OutboundInvoiceWithCentre;
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

    const { data: existingInvoices } = await admin
      .from("outbound_invoices")
      .select("centre_id")
      .lte("period_start", periodEnd)
      .gte("period_end", periodStart);

    const existingCentreIds = new Set(
      (existingInvoices ?? []).map((inv: { centre_id: string }) => inv.centre_id)
    );

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

      if (existingCentreIds.has(centre.id)) continue;

      if (!centreMap.has(centre.id)) {
        centreMap.set(centre.id, { centre, sessions: [] });
      }
      centreMap.get(centre.id)!.sessions.push(session);
    }

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

    // Load business settings for GST and payment terms
    const settings = await getBusinessSettingsForInvoice();
    const gstRate = settings.gst_rate ?? 10;
    const gstEnabled = settings.gst_enabled ?? true;
    const paymentTermsDays = settings.payment_terms_days ?? 14;

    // Calculate due date: period_end + payment_terms_days
    const dueDate = new Date(periodEnd);
    dueDate.setDate(dueDate.getDate() + paymentTermsDays);
    const dueDateStr = dueDate.toISOString().split("T")[0];

    const invoices = [];

    for (const preview of previews) {
      const { data: numberResult } = await admin.rpc(
        "next_outbound_invoice_number",
        { year_month: yearMonth }
      );

      const invoiceNumber = numberResult as string;

      // Calculate subtotal, GST, and total in cents
      const subtotalCents = Math.round(preview.totalAmount * 100);
      const gstAmountCents = gstEnabled
        ? Math.round(subtotalCents * (gstRate / 100))
        : 0;
      const totalCents = subtotalCents + gstAmountCents;

      invoices.push({
        centre_id: preview.centreId,
        period_start: periodStart,
        period_end: periodEnd,
        line_items_json: preview.lineItems,
        amount: preview.totalAmount,
        subtotal_cents: subtotalCents,
        gst_amount_cents: gstAmountCents,
        total_cents: totalCents,
        due_date: dueDateStr,
        status: "draft" as const,
        invoice_number: invoiceNumber,
        created_by: user.id,
      });
    }

    const { error: insertError } = await admin
      .from("outbound_invoices")
      .insert(invoices);

    if (insertError) return { data: null, error: insertError.message };

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
    const subtotalCents = Math.round(newTotal * 100);

    // Load GST rate from business settings
    const settings = await getBusinessSettingsForInvoice();
    const gstRate = settings.gst_enabled ? settings.gst_rate / 100 : 0;
    const gstAmountCents = Math.round(subtotalCents * gstRate);
    const totalCents = subtotalCents + gstAmountCents;

    const { error } = await supabase
      .from("outbound_invoices")
      .update({
        line_items_json: lineItems as unknown as Record<string, unknown>[],
        amount: newTotal,
        subtotal_cents: subtotalCents,
        gst_amount_cents: gstAmountCents,
        total_cents: totalCents,
        // Any previously rendered PDF no longer matches the line items.
        // Clearing pdf_url forces sendInvoice to regenerate — otherwise
        // the centre receives a stale PDF with the old amounts.
        pdf_url: null,
      })
      .eq("id", invoiceId)
      .eq("status", "draft");

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

// ============================================================
// Business Settings Helper
// ============================================================

interface BusinessSettingsMap {
  business_name: string;
  abn: string;
  business_address: string;
  business_phone: string;
  business_email: string;
  bank_name: string;
  bank_bsb: string;
  bank_account_number: string;
  bank_account_name: string;
  payment_terms_text: string;
  payment_terms_days: number;
  gst_enabled: boolean;
  gst_inclusive: boolean;
  gst_rate: number;
  square_online_enabled: boolean;
  square_payment_url: string;
}

const SETTINGS_DEFAULTS: BusinessSettingsMap = {
  business_name: "Build Alpha Kids",
  abn: "",
  business_address: "",
  business_phone: "",
  business_email: "",
  bank_name: "",
  bank_bsb: "",
  bank_account_number: "",
  bank_account_name: "",
  payment_terms_text: "Payment due within 14 days of invoice date.",
  payment_terms_days: 14,
  gst_enabled: true,
  gst_inclusive: false,
  gst_rate: 10,
  square_online_enabled: false,
  square_payment_url: "",
};

const BOOLEAN_SETTING_KEYS: (keyof BusinessSettingsMap)[] = [
  "gst_enabled",
  "gst_inclusive",
  "square_online_enabled",
];

const NUMBER_SETTING_KEYS: (keyof BusinessSettingsMap)[] = [
  "payment_terms_days",
  "gst_rate",
];

/**
 * Load business settings for PDF/email generation.
 * Uses admin client so it works without per-request auth dependency.
 */
async function getBusinessSettingsForInvoice(): Promise<BusinessSettingsMap> {
  const admin = createSupabaseAdmin();

  const { data: rows } = await admin
    .from("business_settings")
    .select("key, value");

  const settings: BusinessSettingsMap = { ...SETTINGS_DEFAULTS };

  if (rows && rows.length > 0) {
    for (const row of rows) {
      const key = row.key as keyof BusinessSettingsMap;
      if (key in SETTINGS_DEFAULTS) {
        let parsed: string | number | boolean = row.value;
        if (BOOLEAN_SETTING_KEYS.includes(key)) {
          parsed = row.value === "true";
        } else if (NUMBER_SETTING_KEYS.includes(key)) {
          parsed = Number(row.value);
        }
        (settings as unknown as Record<string, string | number | boolean>)[key] = parsed;
      }
    }
  }

  return settings;
}

// ============================================================
// PDF Generation
// ============================================================

export async function generateInvoicePDF(invoiceId: string): Promise<{
  data: { pdfUrl: string } | null;
  error: string | null;
}> {
  try {
    const admin = createSupabaseAdmin();

    // 1. Fetch invoice detail + centre data
    const { data: invoice, error: fetchError } = await admin
      .from("outbound_invoices")
      .select("*, centres(*)")
      .eq("id", invoiceId)
      .single();

    if (fetchError || !invoice) {
      return { data: null, error: "Invoice not found." };
    }

    const centre = invoice.centres as unknown as Centre;

    // 2. Load business settings
    const settings = await getBusinessSettingsForInvoice();

    // 3. Render PDF using react-pdf
    const { OutboundInvoicePDF } = await import(
      "@/lib/outbound-invoicing/pdf-template"
    );
    const { renderToBuffer } = await import("@react-pdf/renderer");

    const subtotalCents = invoice.subtotal_cents ?? Math.round(invoice.amount * 100);
    const gstAmountCents = invoice.gst_amount_cents ?? 0;
    const totalCents = invoice.total_cents ?? subtotalCents + gstAmountCents;
    const invoiceLineItems = (invoice.line_items_json as unknown as OutboundLineItem[]) ?? [];
    const bankHasDetails = !!(settings.bank_bsb && settings.bank_account_number);

    const pdfDoc = OutboundInvoicePDF({
      invoiceNumber: invoice.invoice_number ?? invoiceId,
      invoiceDate: new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }),
      dueDate: invoice.due_date
        ? new Date(invoice.due_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
        : "14 days from invoice date",
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
      paymentTermsText: settings.payment_terms_text ?? "Payment due within 14 days",
      from: {
        businessName: settings.business_name ?? "Build Alpha Kids",
        abn: settings.abn ?? "",
        address: settings.business_address ?? "",
        phone: settings.business_phone ?? "",
        email: settings.business_email ?? "info@buildalphakids.com.au",
      },
      to: {
        centreName: centre?.name ?? "Unknown",
        contactName: centre?.primary_contact_name ?? null,
        address: centre?.address ?? null,
      },
      lineItems: invoiceLineItems.map((item) => ({
        date: item.date,
        description: item.description,
        sport: item.sport,
        quantity: item.headcount,
        rate: item.rate,
        amount: item.amount,
      })),
      subtotal: subtotalCents / 100,
      gstAmount: gstAmountCents > 0 ? gstAmountCents / 100 : null,
      total: totalCents / 100,
      bankDetails: bankHasDetails ? {
        bankName: settings.bank_name ?? "",
        bsb: settings.bank_bsb ?? "",
        accountNumber: settings.bank_account_number ?? "",
        accountName: settings.bank_account_name ?? "Build Alpha Kids",
      } : null,
      payOnlineUrl: settings.square_online_enabled ? (settings.square_payment_url || null) : null,
    });

    const pdfBuffer = await renderToBuffer(pdfDoc);

    // 4. Upload to Supabase Storage
    const storagePath = `outbound/${centre?.id ?? "unknown"}/${invoice.invoice_number ?? invoiceId}.pdf`;

    const { error: uploadError } = await admin.storage
      .from("invoices")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return { data: null, error: `Failed to upload PDF: ${uploadError.message}` };
    }

    // 5. Get public URL
    const {
      data: { publicUrl },
    } = admin.storage.from("invoices").getPublicUrl(storagePath);

    // 6. Update invoice record with PDF URL
    const { error: updateError } = await admin
      .from("outbound_invoices")
      .update({ pdf_url: publicUrl })
      .eq("id", invoiceId);

    if (updateError) {
      return { data: null, error: `Failed to update invoice: ${updateError.message}` };
    }

    return { data: { pdfUrl: publicUrl }, error: null };
  } catch (err) {
    console.error("generateInvoicePDF:", err);
    return { data: null, error: "Failed to generate invoice PDF." };
  }
}

// ============================================================
// Send Invoice (with PDF + email)
// ============================================================

export async function sendInvoice(invoiceId: string): Promise<{
  data: boolean | null;
  error: string | null;
}> {
  try {
    // 1. Auth check
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    // 2. Fetch invoice — must be "approved" status
    const { data: invoice, error: fetchError } = await admin
      .from("outbound_invoices")
      .select("*, centres(name, primary_contact_email)")
      .eq("id", invoiceId)
      .single();

    if (fetchError || !invoice) {
      return { data: null, error: "Invoice not found." };
    }

    if (invoice.status !== "approved") {
      return { data: null, error: "Invoice must be approved before sending." };
    }

    const centre = invoice.centres as unknown as {
      name: string;
      primary_contact_email: string | null;
    };

    if (!centre?.primary_contact_email) {
      return {
        data: null,
        error: "Centre does not have a primary contact email address.",
      };
    }

    // 3. Generate PDF if not already generated
    let pdfUrl = invoice.pdf_url as string | null;
    if (!pdfUrl) {
      const pdfResult = await generateInvoicePDF(invoiceId);
      if (pdfResult.error || !pdfResult.data) {
        return { data: null, error: pdfResult.error ?? "Failed to generate PDF." };
      }
      pdfUrl = pdfResult.data.pdfUrl;
    }

    // 4. Download PDF from storage as Buffer for email attachment
    const storagePathMatch = pdfUrl.match(/invoices\/(.+)$/);
    if (!storagePathMatch) {
      return { data: null, error: "Could not determine PDF storage path." };
    }

    const { data: pdfData, error: downloadError } = await admin.storage
      .from("invoices")
      .download(storagePathMatch[1]);

    if (downloadError || !pdfData) {
      return { data: null, error: "Failed to download PDF for attachment." };
    }

    const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());

    // 5. Load business settings for email content
    const settings = await getBusinessSettingsForInvoice();

    // 6. Build email using inline template
    const centreName = centre.name ?? "Unknown";
    const invoiceNumber = (invoice.invoice_number as string) ?? "N/A";
    const totalAmount =
      invoice.total_cents != null
        ? `$${(Number(invoice.total_cents) / 100).toFixed(2)}`
        : `$${Number(invoice.amount).toFixed(2)}`;

    const emailSubject = `Invoice ${invoiceNumber} from Build Alpha Kids`;
    const emailHtml = buildOutboundInvoiceEmail(
      centreName,
      invoiceNumber,
      invoice.period_start as string,
      invoice.period_end as string,
      totalAmount,
      settings
    );

    // 7. Send via Resend with PDF attachment
    const { sendEmailWithAttachment } = await import("@/lib/email/send");
    const emailResult = await sendEmailWithAttachment(
      centre.primary_contact_email,
      emailSubject,
      emailHtml,
      {
        filename: `${invoiceNumber}.pdf`,
        content: pdfBuffer,
      }
    );

    if (!emailResult.success) {
      return {
        data: null,
        error: `Failed to send email: ${emailResult.error ?? "Unknown error"}`,
      };
    }

    // 8. Update invoice: status → "sent", timestamps
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      status: "sent",
      sent_at: now,
      email_sent_at: now,
    };

    // 9. Set due_date if not already set (based on payment_terms_days)
    if (!invoice.due_date) {
      const paymentTermsDays = settings.payment_terms_days ?? 14;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + paymentTermsDays);
      updatePayload.due_date = dueDate.toISOString().split("T")[0];
    }

    const { error: updateError } = await admin
      .from("outbound_invoices")
      .update(updatePayload)
      .eq("id", invoiceId);

    if (updateError) {
      return { data: null, error: `Invoice sent but failed to update status: ${updateError.message}` };
    }

    // 10. Activity log
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoice_sent",
      entity_type: "outbound_invoice",
      entity_id: invoiceId,
      metadata: {
        invoice_number: invoiceNumber,
        centre_name: centreName,
        sent_to: centre.primary_contact_email,
      },
    });

    // 11. Notify ops
    await triggerNotificationForOps({
      type: "invoice_status_changed",
      title: "Outbound invoice sent",
      body: `Invoice ${invoiceNumber} for ${centreName} has been emailed to ${centre.primary_contact_email}.`,
      entityType: "outbound_invoice",
      entityId: invoiceId,
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    revalidatePath(`/ops/invoicing/outbound/${invoiceId}`);
    revalidatePath(`/admin/invoicing/outbound/${invoiceId}`);

    return { data: true, error: null };
  } catch (err) {
    console.error("sendInvoice:", err);
    return { data: null, error: "Failed to send invoice." };
  }
}

/**
 * Build the outbound invoice email HTML for sending to centres.
 */
function buildOutboundInvoiceEmail(
  centreName: string,
  invoiceNumber: string,
  periodStart: string,
  periodEnd: string,
  totalAmount: string,
  settings: BusinessSettingsMap
): string {
  const BRAND_ORANGE = "#E8712A";
  const BRAND_GREY = "#666666";
  const period = `${formatOutboundDate(periodStart)} \u2013 ${formatOutboundDate(periodEnd)}`;

  return `<!DOCTYPE html>
<html lang="en-AU">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#F5F5F5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;">
        <tr><td style="background:${BRAND_ORANGE};padding:20px 24px;">
          <h1 style="margin:0;color:#FFFFFF;font-size:18px;font-weight:700;">Build Alpha Kids</h1>
        </td></tr>
        <tr><td style="padding:32px 24px;">
          <p style="margin:0 0 16px;color:#1A1A1A;">Hi ${centreName} Team,</p>
          <p style="margin:0 0 16px;color:#1A1A1A;">Please find attached your invoice for multi-sport coaching services.</p>
          <table role="presentation" style="margin:16px 0;width:100%;">
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};width:120px;">Invoice #</td><td style="padding:4px 8px;font-weight:600;">${invoiceNumber}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Period</td><td style="padding:4px 8px;font-weight:600;">${period}</td></tr>
            <tr><td style="padding:4px 8px;color:${BRAND_GREY};">Total</td><td style="padding:4px 8px;font-weight:600;color:${BRAND_ORANGE};">${totalAmount}${settings.gst_enabled ? " (inc. GST)" : ""}</td></tr>
          </table>
          <p style="margin:16px 0;color:#1A1A1A;">${settings.payment_terms_text}</p>
          ${settings.bank_name ? `
          <div style="padding:16px;background:#F9F9F9;border-radius:6px;margin:16px 0;">
            <p style="margin:0 0 8px;font-weight:600;color:#1A1A1A;">Bank Details</p>
            <table role="presentation" style="width:100%;">
              <tr><td style="padding:2px 8px;color:${BRAND_GREY};width:120px;">Bank</td><td style="padding:2px 8px;">${settings.bank_name}</td></tr>
              <tr><td style="padding:2px 8px;color:${BRAND_GREY};">Account Name</td><td style="padding:2px 8px;">${settings.bank_account_name}</td></tr>
              <tr><td style="padding:2px 8px;color:${BRAND_GREY};">BSB</td><td style="padding:2px 8px;">${settings.bank_bsb}</td></tr>
              <tr><td style="padding:2px 8px;color:${BRAND_GREY};">Account</td><td style="padding:2px 8px;">${settings.bank_account_number}</td></tr>
            </table>
          </div>
          ` : ""}
          <p style="margin:16px 0 0;color:${BRAND_GREY};font-size:13px;">Please reference <strong>${invoiceNumber}</strong> in your payment description.</p>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #EEEEEE;text-align:center;color:${BRAND_GREY};font-size:12px;">
          Build Alpha Kids &bull; Multi-Sport Coaching<br>
          ${settings.abn ? `ABN: ${settings.abn}` : ""}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function recordPayment(
  invoiceId: string,
  payment: {
    date: string;
    amountCents: number;
    method: InvoicePaymentMethod;
    reference: string | null;
    notes: string | null;
  }
): Promise<{ data: boolean | null; error: string | null }> {
  try {
    // 1. Auth check
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    // 2. Fetch invoice
    const { data: invoice, error: fetchError } = await admin
      .from("outbound_invoices")
      .select("*, centres(name)")
      .eq("id", invoiceId)
      .single();

    if (fetchError || !invoice) {
      return { data: null, error: "Invoice not found." };
    }

    // 2b. Validate invoice is in a payable status
    const payableStatuses = ["sent", "partially_paid", "overdue"];
    if (!payableStatuses.includes(invoice.status as string)) {
      return { data: null, error: "Invoice is not in a payable status." };
    }

    // 3. Create payment record and append to payment_history jsonb array
    const newPaymentRecord: InvoicePaymentRecord = {
      date: payment.date,
      amount_cents: payment.amountCents,
      method: payment.method,
      reference: payment.reference,
      notes: payment.notes,
      recorded_by: user.id,
      recorded_at: new Date().toISOString(),
    };

    const existingHistory = (invoice.payment_history as InvoicePaymentRecord[]) ?? [];
    const updatedHistory = [...existingHistory, newPaymentRecord];

    // 4. Update paid_amount_cents (sum of all payments)
    const totalPaidCents = updatedHistory.reduce(
      (sum, p) => sum + p.amount_cents,
      0
    );

    // 5/6. Determine status: paid if >= total, else partially_paid
    const invoiceTotalCents =
      (invoice.total_cents as number | null) ?? Math.round(Number(invoice.amount) * 100);
    const isFullyPaid = totalPaidCents >= invoiceTotalCents;
    const newStatus: OutboundInvoiceStatus = isFullyPaid ? "paid" : "partially_paid";

    // 7. Set payment_method and payment_reference to latest payment
    const { error: updateError } = await admin
      .from("outbound_invoices")
      .update({
        payment_history: updatedHistory as unknown as Record<string, unknown>[],
        paid_amount_cents: totalPaidCents,
        status: newStatus,
        payment_date: isFullyPaid ? payment.date : (invoice.payment_date as string | null),
        payment_method: payment.method,
        payment_reference: payment.reference,
      })
      .eq("id", invoiceId);

    if (updateError) return { data: null, error: updateError.message };

    const centreName =
      (invoice.centres as unknown as { name: string })?.name ?? "Unknown";

    // 8. Activity log
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoice_payment_recorded",
      entity_type: "outbound_invoice",
      entity_id: invoiceId,
      metadata: {
        invoice_number: invoice.invoice_number,
        centre_name: centreName,
        amount_cents: payment.amountCents,
        method: payment.method,
        new_status: newStatus,
        total_paid_cents: totalPaidCents,
      },
    });

    // 9. Revalidate paths
    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    revalidatePath(`/ops/invoicing/outbound/${invoiceId}`);
    revalidatePath(`/admin/invoicing/outbound/${invoiceId}`);

    return { data: true, error: null };
  } catch (err) {
    console.error("recordPayment:", err);
    return { data: null, error: "Failed to record payment." };
  }
}

export async function voidInvoice(
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

    const { data: invoice } = await admin
      .from("outbound_invoices")
      .select("invoice_number, status, centres(name)")
      .eq("id", invoiceId)
      .single();

    if (!invoice) {
      return { data: null, error: "Invoice not found." };
    }

    if (invoice.status === "paid" || invoice.status === "void") {
      return { data: null, error: "Cannot void a paid or already voided invoice." };
    }

    const { error: updateError } = await admin
      .from("outbound_invoices")
      .update({ status: "void", notes: reason })
      .eq("id", invoiceId);

    if (updateError) return { data: null, error: updateError.message };

    const centreName =
      (invoice.centres as unknown as { name: string })?.name ?? "Unknown";

    // Activity log
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoice_voided",
      entity_type: "outbound_invoice",
      entity_id: invoiceId,
      metadata: {
        invoice_number: invoice.invoice_number,
        centre_name: centreName,
        reason,
      },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    revalidatePath(`/admin/invoicing/outbound/${invoiceId}`);
    revalidatePath(`/ops/invoicing/outbound/${invoiceId}`);
    return { data: true, error: null };
  } catch (err) {
    console.error("voidInvoice:", err);
    return { data: null, error: "Failed to void invoice." };
  }
}

// ============================================================
// Summary & Reporting Actions
// ============================================================

export interface InvoiceSummary {
  totalInvoicedThisMonth: number;
  totalPaidThisMonth: number;
  totalOutstanding: number;
  totalOverdue: number;
}

export async function getInvoiceSummary(): Promise<{
  data: InvoiceSummary | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const today = now.toISOString().split("T")[0];

    // All invoices created this month (excluding voided)
    const { data: thisMonthInvoices } = await admin
      .from("outbound_invoices")
      .select("total_cents, amount")
      .gte("created_at", monthStart)
      .neq("status", "void");

    // Invoices paid this month
    const { data: paidThisMonth } = await admin
      .from("outbound_invoices")
      .select("total_cents, amount")
      .eq("status", "paid")
      .gte("payment_date", monthStart);

    // Outstanding (sent or partially paid)
    const { data: outstanding } = await admin
      .from("outbound_invoices")
      .select("total_cents, amount, paid_amount_cents")
      .in("status", ["sent", "partially_paid", "overdue"]);

    // Overdue (sent or partially paid, past due date)
    const { data: overdue } = await admin
      .from("outbound_invoices")
      .select("total_cents, amount, paid_amount_cents")
      .in("status", ["sent", "partially_paid", "overdue"])
      .lt("due_date", today);

    const getTotal = (
      rows: { total_cents: number | null; amount: number }[] | null
    ): number =>
      (rows ?? []).reduce(
        (sum, r) => sum + ((r.total_cents as number | null) ?? Math.round(Number(r.amount) * 100)),
        0
      );

    const getOutstandingTotal = (
      rows: {
        total_cents: number | null;
        amount: number;
        paid_amount_cents: number | null;
      }[] | null
    ): number =>
      (rows ?? []).reduce(
        (sum, r) =>
          sum +
          ((r.total_cents as number | null) ?? Math.round(Number(r.amount) * 100)) -
          ((r.paid_amount_cents as number | null) ?? 0),
        0
      );

    return {
      data: {
        totalInvoicedThisMonth: getTotal(thisMonthInvoices),
        totalPaidThisMonth: getTotal(paidThisMonth),
        totalOutstanding: getOutstandingTotal(outstanding),
        totalOverdue: getOutstandingTotal(overdue),
      },
      error: null,
    };
  } catch (err) {
    console.error("getInvoiceSummary:", err);
    return { data: null, error: "Failed to fetch invoice summary." };
  }
}

export interface AgeingBracket {
  label: string;
  invoices: {
    id: string;
    invoiceNumber: string | null;
    centreName: string;
    amountOutstandingCents: number;
    daysOutstanding: number;
    status: string;
    dueDate: string | null;
  }[];
  totalCents: number;
}

export async function getAgeingReport(): Promise<{
  data: AgeingBracket[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    const { data: invoices, error } = await admin
      .from("outbound_invoices")
      .select("id, invoice_number, status, due_date, total_cents, amount, paid_amount_cents, centres(name)")
      .in("status", ["sent", "partially_paid", "overdue"]);

    if (error) return { data: null, error: error.message };

    const today = new Date();

    const brackets: AgeingBracket[] = [
      { label: "Current (not yet due)", invoices: [], totalCents: 0 },
      { label: "1\u201314 days overdue", invoices: [], totalCents: 0 },
      { label: "15\u201330 days overdue", invoices: [], totalCents: 0 },
      { label: "31\u201360 days overdue", invoices: [], totalCents: 0 },
      { label: "60+ days overdue", invoices: [], totalCents: 0 },
    ];

    for (const inv of invoices ?? []) {
      const centreName =
        (inv.centres as unknown as { name: string })?.name ?? "Unknown";
      const totalCents = (inv.total_cents as number | null) ?? Math.round(Number(inv.amount) * 100);
      const paidCents = (inv.paid_amount_cents as number | null) ?? 0;
      const outstandingCents = totalCents - paidCents;

      if (outstandingCents <= 0) continue;

      const dueDate = inv.due_date ? new Date(inv.due_date as string) : null;
      const daysOverdue = dueDate
        ? Math.floor(
            (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        : 0;

      const entry = {
        id: inv.id as string,
        invoiceNumber: inv.invoice_number as string | null,
        centreName,
        amountOutstandingCents: outstandingCents,
        daysOutstanding: Math.max(0, daysOverdue),
        status: inv.status as string,
        dueDate: (inv.due_date as string | null) ?? null,
      };

      let bracketIndex: number;
      if (daysOverdue <= 0) {
        bracketIndex = 0;
      } else if (daysOverdue <= 14) {
        bracketIndex = 1;
      } else if (daysOverdue <= 30) {
        bracketIndex = 2;
      } else if (daysOverdue <= 60) {
        bracketIndex = 3;
      } else {
        bracketIndex = 4;
      }

      brackets[bracketIndex].invoices.push(entry);
      brackets[bracketIndex].totalCents += outstandingCents;
    }

    return { data: brackets, error: null };
  } catch (err) {
    console.error("getAgeingReport:", err);
    return { data: null, error: "Failed to generate ageing report." };
  }
}

// ============================================================
// GST Report (BAS)
// ============================================================

export interface GSTReportLine {
  id: string;
  invoiceNumber: string | null;
  centreName: string;
  invoiceDate: string;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
}

export interface GSTReport {
  periodStart: string;
  periodEnd: string;
  totalSalesCents: number;
  totalGSTCents: number;
  invoices: GSTReportLine[];
}

export async function getGSTReport(
  periodStart: string,
  periodEnd: string
): Promise<{ data: GSTReport | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const admin = createSupabaseAdmin();

    const { data: invoices, error } = await admin
      .from("outbound_invoices")
      .select(
        "id, invoice_number, created_at, subtotal_cents, gst_amount_cents, total_cents, amount, centres(name)"
      )
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .neq("status", "void")
      .neq("status", "draft")
      .order("created_at", { ascending: true });

    if (error) return { data: null, error: error.message };

    let totalSalesCents = 0;
    let totalGSTCents = 0;

    const lines: GSTReportLine[] = (invoices ?? []).map((inv) => {
      const centreName =
        (inv.centres as unknown as { name: string })?.name ?? "Unknown";
      const subtotal = (inv.subtotal_cents as number | null) ?? Math.round(Number(inv.amount) * 100);
      const gst = (inv.gst_amount_cents as number | null) ?? 0;
      const total = (inv.total_cents as number | null) ?? subtotal + gst;

      totalSalesCents += subtotal;
      totalGSTCents += gst;

      return {
        id: inv.id as string,
        invoiceNumber: inv.invoice_number as string | null,
        centreName,
        invoiceDate: inv.created_at as string,
        subtotalCents: subtotal,
        gstCents: gst,
        totalCents: total,
      };
    });

    return {
      data: {
        periodStart,
        periodEnd,
        totalSalesCents,
        totalGSTCents,
        invoices: lines,
      },
      error: null,
    };
  } catch (err) {
    console.error("getGSTReport:", err);
    return { data: null, error: "Failed to generate GST report." };
  }
}

// ============================================================
// Export Actions (for accountant CSV)
// ============================================================

export interface InvoiceRegisterRow {
  invoice_number: string | null;
  centre_name: string;
  period_start: string;
  period_end: string;
  subtotal_cents: number;
  gst_amount_cents: number;
  total_cents: number;
  status: string;
  sent_at: string | null;
  due_date: string | null;
  paid_amount_cents: number;
}

export async function getInvoiceRegister(
  periodStart: string,
  periodEnd: string
): Promise<{ data: InvoiceRegisterRow[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("outbound_invoices")
      .select("invoice_number, subtotal_cents, gst_amount_cents, total_cents, status, sent_at, due_date, paid_amount_cents, period_start, period_end, centres(name)")
      .gte("period_start", periodStart)
      .lte("period_end", periodEnd)
      .not("status", "eq", "void")
      .order("period_start", { ascending: true });

    if (error) return { data: null, error: error.message };

    const rows: InvoiceRegisterRow[] = (data ?? []).map((inv) => {
      const centreName =
        (inv.centres as unknown as { name: string })?.name ?? "Unknown";
      return {
        invoice_number: inv.invoice_number,
        centre_name: centreName,
        period_start: inv.period_start,
        period_end: inv.period_end,
        subtotal_cents: (inv.subtotal_cents as number) ?? 0,
        gst_amount_cents: (inv.gst_amount_cents as number) ?? 0,
        total_cents: (inv.total_cents as number) ?? 0,
        status: inv.status,
        sent_at: inv.sent_at,
        due_date: inv.due_date,
        paid_amount_cents: (inv.paid_amount_cents as number) ?? 0,
      };
    });

    return { data: rows, error: null };
  } catch (err) {
    console.error("getInvoiceRegister:", err);
    return { data: null, error: "Failed to fetch invoice register." };
  }
}

export interface PaymentRegisterRow {
  invoice_number: string | null;
  centre_name: string;
  payment_date: string;
  amount_cents: number;
  method: string;
  reference: string | null;
}

export async function getPaymentRegister(
  periodStart: string,
  periodEnd: string
): Promise<{ data: PaymentRegisterRow[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("outbound_invoices")
      .select("invoice_number, payment_history, centres(name)")
      .not("payment_history", "is", null)
      .gte("period_start", periodStart)
      .lte("period_end", periodEnd);

    if (error) return { data: null, error: error.message };

    const rows: PaymentRegisterRow[] = [];

    for (const inv of data ?? []) {
      const centreName =
        (inv.centres as unknown as { name: string })?.name ?? "Unknown";
      const history = (inv.payment_history as InvoicePaymentRecord[]) ?? [];
      for (const payment of history) {
        rows.push({
          invoice_number: inv.invoice_number,
          centre_name: centreName,
          payment_date: payment.date,
          amount_cents: payment.amount_cents,
          method: payment.method,
          reference: payment.reference,
        });
      }
    }

    rows.sort((a, b) => a.payment_date.localeCompare(b.payment_date));
    return { data: rows, error: null };
  } catch (err) {
    console.error("getPaymentRegister:", err);
    return { data: null, error: "Failed to fetch payment register." };
  }
}

export interface GstSummaryRow {
  invoice_number: string | null;
  centre_name: string;
  subtotal_cents: number;
  gst_amount_cents: number;
  total_cents: number;
  period_start: string;
  period_end: string;
}

export async function getGstSummary(
  periodStart: string,
  periodEnd: string
): Promise<{ data: GstSummaryRow[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("outbound_invoices")
      .select("invoice_number, subtotal_cents, gst_amount_cents, total_cents, period_start, period_end, centres(name)")
      .gte("period_start", periodStart)
      .lte("period_end", periodEnd)
      .not("status", "in", '("draft","pending_approval","void")')
      .not("gst_amount_cents", "is", null)
      .gt("gst_amount_cents", 0)
      .order("period_start", { ascending: true });

    if (error) return { data: null, error: error.message };

    const rows: GstSummaryRow[] = (data ?? []).map((inv) => {
      const centreName =
        (inv.centres as unknown as { name: string })?.name ?? "Unknown";
      return {
        invoice_number: inv.invoice_number,
        centre_name: centreName,
        subtotal_cents: (inv.subtotal_cents as number) ?? 0,
        gst_amount_cents: (inv.gst_amount_cents as number) ?? 0,
        total_cents: (inv.total_cents as number) ?? 0,
        period_start: inv.period_start,
        period_end: inv.period_end,
      };
    });

    return { data: rows, error: null };
  } catch (err) {
    console.error("getGstSummary:", err);
    return { data: null, error: "Failed to fetch GST summary." };
  }
}
