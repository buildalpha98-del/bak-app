"use server";

// ============================================================
// Launch Foundation — Invoice server actions
// ============================================================

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateInvoiceNumber,
  calculateCentreInvoice,
  calculateSchoolInvoice,
} from "@/lib/launch/invoice-generator";
import { sendEmail } from "@/lib/launch/email";
import { createNotification } from "@/lib/launch/notifications";
import { invoiceReady } from "@/lib/launch/email-templates";
import { revalidatePath } from "next/cache";
import type { Invoice, InvoiceLineItem } from "@/lib/launch/types";
import { getBaseUrl } from "@/lib/utils/base-url";

// ========================
// Types
// ========================

export interface InvoiceWithItems extends Invoice {
  line_items: InvoiceLineItem[];
  entity_name?: string;
}

// ========================
// 1. createCentreInvoice
// ========================

export async function createCentreInvoice(params: {
  centreId: string;
  startDate: string;
  endDate: string;
  createdBy: string;
}): Promise<{ success: boolean; invoiceId?: string; invoiceNumber?: string; error?: string }> {
  try {
    const adminClient = createSupabaseAdmin();

    // 1. Calculate invoice
    const calc = await calculateCentreInvoice({
      centreId: params.centreId,
      startDate: params.startDate,
      endDate: params.endDate,
    });

    if (calc.lineItems.length === 0) {
      return { success: false, error: "No completed sessions found for this period." };
    }

    // 2. Generate invoice number
    const invoiceNumber = await generateInvoiceNumber();

    // 3. Insert invoice record
    const { data: invoice, error: invErr } = await adminClient
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        centre_id: params.centreId,
        issue_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
        subtotal: calc.subtotal,
        gst: calc.gst,
        total: calc.total,
        status: "draft",
        created_by: params.createdBy,
      })
      .select("id")
      .single();

    if (invErr || !invoice) {
      return { success: false, error: invErr?.message || "Failed to create invoice." };
    }

    // 4. Insert line items
    const lineItems = calc.lineItems.map((li) => ({
      invoice_id: invoice.id,
      session_id: li.sessionId,
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unitPrice,
      line_total: li.lineTotal,
    }));

    const { error: liErr } = await adminClient
      .from("invoice_line_items")
      .insert(lineItems);

    if (liErr) {
      console.error("Line items insert error:", liErr);
    }

    // 5. Generate and upload PDF
    const pdfPath = await generateAndUploadPdf(
      invoice.id,
      invoiceNumber,
      params.centreId,
      null,
      calc
    );

    // 6. Update invoice with PDF path
    if (pdfPath) {
      await adminClient
        .from("invoices")
        .update({ pdf_storage_path: pdfPath })
        .eq("id", invoice.id);
    }

    revalidatePath("/admin/invoicing");
    return { success: true, invoiceId: invoice.id, invoiceNumber };
  } catch (err) {
    console.error("createCentreInvoice error:", err);
    return { success: false, error: "Failed to create invoice." };
  }
}

// ========================
// 2. createSchoolInvoice
// ========================

export async function createSchoolInvoice(params: {
  schoolId: string;
  termStartDate: string;
  termEndDate: string;
  createdBy: string;
}): Promise<{ success: boolean; invoiceId?: string; invoiceNumber?: string; error?: string }> {
  try {
    const adminClient = createSupabaseAdmin();

    const calc = await calculateSchoolInvoice({
      schoolId: params.schoolId,
      termStartDate: params.termStartDate,
      termEndDate: params.termEndDate,
    });

    if (calc.lineItems.length === 0) {
      return { success: false, error: "No completed sessions found for this term." };
    }

    const invoiceNumber = await generateInvoiceNumber();

    const { data: invoice, error: invErr } = await adminClient
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        school_id: params.schoolId,
        issue_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
        subtotal: calc.subtotal,
        gst: calc.gst,
        total: calc.total,
        status: "draft",
        created_by: params.createdBy,
      })
      .select("id")
      .single();

    if (invErr || !invoice) {
      return { success: false, error: invErr?.message || "Failed to create invoice." };
    }

    const lineItems = calc.lineItems.map((li) => ({
      invoice_id: invoice.id,
      session_id: li.sessionId,
      description: li.description,
      quantity: li.childCount,
      unit_price: li.unitPrice,
      line_total: li.lineTotal,
    }));

    const { error: liErr } = await adminClient
      .from("invoice_line_items")
      .insert(lineItems);

    if (liErr) {
      console.error("Line items insert error:", liErr);
    }

    const pdfPath = await generateAndUploadPdf(
      invoice.id,
      invoiceNumber,
      null,
      params.schoolId,
      calc
    );

    if (pdfPath) {
      await adminClient
        .from("invoices")
        .update({ pdf_storage_path: pdfPath })
        .eq("id", invoice.id);
    }

    revalidatePath("/admin/invoicing");
    return { success: true, invoiceId: invoice.id, invoiceNumber };
  } catch (err) {
    console.error("createSchoolInvoice error:", err);
    return { success: false, error: "Failed to create invoice." };
  }
}

// ========================
// 3. getInvoices
// ========================

export async function getInvoices(params?: {
  centreId?: string;
  schoolId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}): Promise<InvoiceWithItems[]> {
  try {
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("invoices")
      .select("*, invoice_line_items(*), centres:centre_id(name), schools:school_id(name)")
      .order("issue_date", { ascending: false });

    if (params?.centreId) query = query.eq("centre_id", params.centreId);
    if (params?.schoolId) query = query.eq("school_id", params.schoolId);
    if (params?.status) query = query.eq("status", params.status);
    if (params?.startDate) query = query.gte("issue_date", params.startDate);
    if (params?.endDate) query = query.lte("issue_date", params.endDate);

    const { data, error } = await query;

    if (error) {
      console.error("getInvoices error:", error);
      return [];
    }

    return (data ?? []).map((row: Record<string, unknown>) => {
      const centre = row.centres as { name: string } | null;
      const school = row.schools as { name: string } | null;
      return {
        ...(row as unknown as Invoice),
        line_items: (row.invoice_line_items ?? []) as InvoiceLineItem[],
        entity_name: centre?.name || school?.name || "Unknown",
      };
    });
  } catch (err) {
    console.error("getInvoices error:", err);
    return [];
  }
}

// ========================
// 4. updateInvoiceStatus
// ========================

export async function updateInvoiceStatus(params: {
  invoiceId: string;
  status: "sent" | "paid" | "overdue";
  paymentDate?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = createSupabaseAdmin();

    const updateData: Record<string, unknown> = { status: params.status };
    if (params.status === "paid" && params.paymentDate) {
      updateData.payment_date = params.paymentDate;
    }

    const { error } = await adminClient
      .from("invoices")
      .update(updateData)
      .eq("id", params.invoiceId);

    if (error) return { success: false, error: error.message };

    // If marking as sent, send email + notification to centre director
    if (params.status === "sent") {
      void notifyCentreDirector(params.invoiceId).catch(console.error);
    }

    revalidatePath("/admin/invoicing");
    return { success: true };
  } catch (err) {
    console.error("updateInvoiceStatus error:", err);
    return { success: false, error: "Failed to update status." };
  }
}

// ========================
// 5. getInvoicePdfUrl
// ========================

export async function getInvoicePdfUrl(
  invoiceId: string
): Promise<{ url: string | null; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: invoice } = await supabase
      .from("invoices")
      .select("pdf_storage_path")
      .eq("id", invoiceId)
      .single();

    if (!invoice?.pdf_storage_path) {
      return { url: null, error: "No PDF available." };
    }

    const { data } = await supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.pdf_storage_path, 3600);

    return { url: data?.signedUrl || null };
  } catch (err) {
    console.error("getInvoicePdfUrl error:", err);
    return { url: null, error: "Failed to generate PDF URL." };
  }
}

// ========================
// 6. previewCentreInvoice (for UI preview before generating)
// ========================

export async function previewCentreInvoice(params: {
  centreId: string;
  startDate: string;
  endDate: string;
}) {
  return calculateCentreInvoice(params);
}

// ========================
// 7. previewSchoolInvoice
// ========================

export async function previewSchoolInvoice(params: {
  schoolId: string;
  termStartDate: string;
  termEndDate: string;
}) {
  return calculateSchoolInvoice(params);
}

// ========================
// Helpers
// ========================

async function generateAndUploadPdf(
  invoiceId: string,
  invoiceNumber: string,
  centreId: string | null,
  schoolId: string | null,
  calc: { lineItems: Array<{ sessionId: string; date: string; description: string; quantity?: number; childCount?: number; unitPrice: number; lineTotal: number }>; subtotal: number; gst: number; total: number }
): Promise<string | null> {
  try {
    const adminClient = createSupabaseAdmin();
    const isGstRegistered = process.env.BAK_GST_REGISTERED === "true";

    // Get entity details
    let entityName = "Unknown";
    let entityAddress: string | null = null;

    if (centreId) {
      const { data: centre } = await adminClient
        .from("centres")
        .select("name, address")
        .eq("id", centreId)
        .single();
      entityName = centre?.name || "Unknown";
      entityAddress = centre?.address || null;
    } else if (schoolId) {
      const { data: school } = await adminClient
        .from("schools")
        .select("name, address")
        .eq("id", schoolId)
        .single();
      entityName = school?.name || "Unknown";
      entityAddress = school?.address || null;
    }

    // Build PDF props
    const { LaunchInvoicePDF } = await import("@/lib/launch/invoice-pdf-template");
    const { renderToBuffer } = await import("@react-pdf/renderer");

    const pdfProps = {
      invoiceNumber,
      issueDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      isGstRegistered,
      from: {
        businessName: "Build Alpha Kids Pty Ltd",
        abn: process.env.BAK_ABN || "",
      },
      to: {
        name: entityName,
        address: entityAddress,
      },
      lineItems: calc.lineItems.map((li) => ({
        date: li.date,
        description: li.description,
        quantity: li.quantity ?? li.childCount ?? 1,
        unitPrice: li.unitPrice,
        lineTotal: li.lineTotal,
      })),
      subtotal: calc.subtotal,
      gst: calc.gst,
      total: calc.total,
      bankDetails:
        process.env.BAK_BANK_NAME
          ? {
              bankName: process.env.BAK_BANK_NAME,
              bsb: process.env.BAK_BANK_BSB || "",
              accountNumber: process.env.BAK_BANK_ACCOUNT || "",
            }
          : null,
      notes: null,
    };

    const buffer = await renderToBuffer(LaunchInvoicePDF(pdfProps));

    const storagePath = `${centreId || schoolId}/${invoiceNumber}.pdf`;

    const { error: uploadErr } = await adminClient.storage
      .from("invoices")
      .upload(storagePath, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) {
      console.error("PDF upload error:", uploadErr);
      return null;
    }

    return storagePath;
  } catch (err) {
    console.error("generateAndUploadPdf error:", err);
    return null;
  }
}

async function notifyCentreDirector(invoiceId: string) {
  const adminClient = createSupabaseAdmin();
  // Centre director invoice notification: staff-facing.
  const APP_URL = getBaseUrl();

  const { data: invoice } = await adminClient
    .from("invoices")
    .select("invoice_number, total, due_date, centre_id")
    .eq("id", invoiceId)
    .single();

  if (!invoice?.centre_id) return;

  const { data: centre } = await adminClient
    .from("centres")
    .select("name, primary_contact_name, primary_contact_email")
    .eq("id", invoice.centre_id)
    .single();

  if (!centre?.primary_contact_email) return;

  const amount = `$${Number(invoice.total).toFixed(2)}`;
  const portalUrl = `${APP_URL}/client/${invoice.centre_id}/invoices`;

  // Send email
  const email = invoiceReady({
    directorName: centre.primary_contact_name || "Director",
    centreName: centre.name,
    invoiceNumber: invoice.invoice_number,
    amount,
    dueDate: invoice.due_date,
    portalUrl,
  });

  void sendEmail({
    to: centre.primary_contact_email,
    subject: email.subject,
    html: email.html,
    emailType: "invoice_ready",
    metadata: { invoice_id: invoiceId },
  }).catch(console.error);

  // Find the client user for this centre and send notification
  const { data: clientUser } = await adminClient
    .from("client_users")
    .select("user_id")
    .eq("centre_id", invoice.centre_id)
    .eq("is_primary", true)
    .maybeSingle();

  if (clientUser?.user_id) {
    void createNotification({
      userId: clientUser.user_id,
      type: "invoice_ready",
      title: "Invoice Available",
      message: `Invoice ${invoice.invoice_number} for ${amount} is ready.`,
      actionUrl: `/client/${invoice.centre_id}/invoices`,
      metadata: { invoice_id: invoiceId },
    }).catch(console.error);
  }
}
