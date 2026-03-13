"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import {
  getAuthorizationUrl,
  getQuickBooksClient,
  isQuickBooksConnected,
} from "./client";
import {
  createCustomer,
  updateCustomer,
  createInvoice,
  getInvoice,
  buildInvoicePayload,
} from "./api";
import type { IntegrationToken, Centre } from "@/lib/types/database";

// ============================================================
// Connection Actions
// ============================================================

export async function getConnectionStatus(): Promise<{
  data: { connected: boolean; companyName: string | null; connectedAt: string | null } | null;
  error: string | null;
}> {
  try {
    const admin = createSupabaseAdmin();
    const { data: row } = await admin
      .from("integration_tokens")
      .select("company_name, connected_at")
      .eq("provider", "quickbooks")
      .single();

    if (!row) {
      return { data: { connected: false, companyName: null, connectedAt: null }, error: null };
    }

    return {
      data: {
        connected: true,
        companyName: row.company_name,
        connectedAt: row.connected_at,
      },
      error: null,
    };
  } catch (err) {
    console.error("getConnectionStatus:", err);
    return { data: null, error: "Failed to check connection status." };
  }
}

export async function getConnectUrl(): Promise<{
  data: string | null;
  error: string | null;
}> {
  try {
    const state = randomBytes(16).toString("hex");
    const cookieStore = await cookies();
    cookieStore.set("qb_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    const url = getAuthorizationUrl(state);
    return { data: url, error: null };
  } catch (err) {
    console.error("getConnectUrl:", err);
    return { data: null, error: "Failed to generate QuickBooks connect URL." };
  }
}

export async function disconnectQuickBooks(): Promise<{
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

    // Delete the token row
    const { error: deleteError } = await admin
      .from("integration_tokens")
      .delete()
      .eq("provider", "quickbooks");

    if (deleteError) return { data: null, error: deleteError.message };

    // Clear all qb_customer_id values (stale if reconnecting to different company)
    await admin
      .from("centres")
      .update({ qb_customer_id: null })
      .not("qb_customer_id", "is", null);

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "qb_disconnected",
      entity_type: "integration",
      metadata: { provider: "quickbooks" },
    });

    revalidatePath("/admin/settings/integrations");
    return { data: true, error: null };
  } catch (err) {
    console.error("disconnectQuickBooks:", err);
    return { data: null, error: "Failed to disconnect QuickBooks." };
  }
}

// ============================================================
// Customer Sync Actions
// ============================================================

export async function syncCentreToQuickBooks(centreId: string): Promise<{
  data: { qbCustomerId: string } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const client = await getQuickBooksClient();
    const admin = createSupabaseAdmin();

    // Fetch centre
    const { data: centre, error: centreError } = await admin
      .from("centres")
      .select("*")
      .eq("id", centreId)
      .single();

    if (centreError || !centre) {
      return { data: null, error: "Centre not found." };
    }

    const customerPayload = {
      DisplayName: centre.name,
      CompanyName: centre.name,
      ...(centre.primary_contact_email && {
        PrimaryEmailAddr: { Address: centre.primary_contact_email },
      }),
      ...(centre.primary_contact_phone && {
        PrimaryPhone: { FreeFormNumber: centre.primary_contact_phone },
      }),
      ...(centre.address && {
        BillAddr: { Line1: centre.address },
      }),
    };

    let qbCustomerId: string;

    if (centre.qb_customer_id) {
      // Update existing customer
      await updateCustomer(client, centre.qb_customer_id, customerPayload);
      qbCustomerId = centre.qb_customer_id;
    } else {
      // Create new customer
      qbCustomerId = await createCustomer(client, customerPayload);

      // Store qb_customer_id on centre
      await admin
        .from("centres")
        .update({ qb_customer_id: qbCustomerId })
        .eq("id", centreId);
    }

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "centre_synced_to_qb",
      entity_type: "centre",
      entity_id: centreId,
      metadata: { qb_customer_id: qbCustomerId },
    });

    revalidatePath("/admin/settings/integrations");
    return { data: { qbCustomerId }, error: null };
  } catch (err) {
    console.error("syncCentreToQuickBooks:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to sync centre.",
    };
  }
}

export async function syncAllCentresToQuickBooks(): Promise<{
  data: { synced: number; failed: { centreId: string; name: string; error: string }[] } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const client = await getQuickBooksClient();
    const admin = createSupabaseAdmin();

    const { data: centres, error: centresError } = await admin
      .from("centres")
      .select("*")
      .in("contract_status", ["active", "trial"]);

    if (centresError || !centres) {
      return { data: null, error: "Failed to fetch centres." };
    }

    let synced = 0;
    const failed: { centreId: string; name: string; error: string }[] = [];

    for (const centre of centres) {
      try {
        const customerPayload = {
          DisplayName: centre.name,
          CompanyName: centre.name,
          ...(centre.primary_contact_email && {
            PrimaryEmailAddr: { Address: centre.primary_contact_email },
          }),
          ...(centre.primary_contact_phone && {
            PrimaryPhone: { FreeFormNumber: centre.primary_contact_phone },
          }),
          ...(centre.address && {
            BillAddr: { Line1: centre.address },
          }),
        };

        let qbCustomerId: string;

        if (centre.qb_customer_id) {
          await updateCustomer(client, centre.qb_customer_id, customerPayload);
          qbCustomerId = centre.qb_customer_id;
        } else {
          qbCustomerId = await createCustomer(client, customerPayload);
          await admin
            .from("centres")
            .update({ qb_customer_id: qbCustomerId })
            .eq("id", centre.id);
        }

        synced++;

        // 200ms delay between API calls to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (err) {
        failed.push({
          centreId: centre.id,
          name: centre.name,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // Log bulk action
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "centres_bulk_synced_to_qb",
      entity_type: "centre",
      metadata: { synced_count: synced, failed_count: failed.length },
    });

    revalidatePath("/admin/settings/integrations");
    return { data: { synced, failed }, error: null };
  } catch (err) {
    console.error("syncAllCentresToQuickBooks:", err);
    return { data: null, error: "Failed to bulk sync centres." };
  }
}

// ============================================================
// Invoice Push Actions
// ============================================================

export async function pushInvoiceToQuickBooks(invoiceId: string): Promise<{
  data: { qbInvoiceId: string } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const client = await getQuickBooksClient();
    const admin = createSupabaseAdmin();

    // Fetch the invoice with centre data
    const { data: invoice, error: invoiceError } = await admin
      .from("outbound_invoices")
      .select("*, centres(name, qb_customer_id)")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return { data: null, error: "Invoice not found." };
    }

    if (invoice.status !== "approved") {
      return { data: null, error: "Invoice must be approved before sending to QuickBooks." };
    }

    const centre = invoice.centres as unknown as { name: string; qb_customer_id: string | null };
    if (!centre?.qb_customer_id) {
      return {
        data: null,
        error: "This centre has not been synced to QuickBooks. Please sync the centre first.",
      };
    }

    // Build and send invoice to QB
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
    const dueDateStr = dueDate.toISOString().split("T")[0];

    const payload = buildInvoicePayload(
      centre.qb_customer_id,
      invoice.invoice_number!,
      invoice.line_items_json as unknown as import("@/lib/types/database").OutboundLineItem[],
      dueDateStr
    );

    const qbInvoiceId = await createInvoice(client, payload);

    // Update invoice record
    const { error: updateError } = await admin
      .from("outbound_invoices")
      .update({
        qb_invoice_id: qbInvoiceId,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (updateError) {
      return { data: null, error: `QB invoice created but failed to update record: ${updateError.message}` };
    }

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_invoice_pushed_to_qb",
      entity_type: "outbound_invoice",
      entity_id: invoiceId,
      metadata: {
        invoice_number: invoice.invoice_number,
        qb_invoice_id: qbInvoiceId,
      },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    return { data: { qbInvoiceId }, error: null };
  } catch (err) {
    console.error("pushInvoiceToQuickBooks:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Failed to push invoice to QuickBooks.",
    };
  }
}

export async function syncPaymentStatuses(): Promise<{
  data: { checked: number; paid: number } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const client = await getQuickBooksClient();
    const admin = createSupabaseAdmin();

    // Fetch all sent invoices with QB IDs
    const { data: invoices, error: invoicesError } = await admin
      .from("outbound_invoices")
      .select("id, qb_invoice_id, invoice_number")
      .eq("status", "sent")
      .not("qb_invoice_id", "is", null);

    if (invoicesError || !invoices) {
      return { data: null, error: "Failed to fetch sent invoices." };
    }

    let paid = 0;

    for (const invoice of invoices) {
      try {
        const qbInvoice = await getInvoice(client, invoice.qb_invoice_id!);

        if (qbInvoice.Balance === 0) {
          await admin
            .from("outbound_invoices")
            .update({ status: "paid" })
            .eq("id", invoice.id);
          paid++;
        }

        // 200ms delay between API calls
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (err) {
        console.error(
          `Failed to check payment for invoice ${invoice.invoice_number}:`,
          err
        );
      }
    }

    // Log activity
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "outbound_payment_status_synced",
      entity_type: "outbound_invoice",
      metadata: { checked_count: invoices.length, paid_count: paid },
    });

    revalidatePath("/ops/invoicing/outbound");
    revalidatePath("/admin/invoicing/outbound");
    return { data: { checked: invoices.length, paid }, error: null };
  } catch (err) {
    console.error("syncPaymentStatuses:", err);
    return { data: null, error: "Failed to sync payment statuses." };
  }
}
