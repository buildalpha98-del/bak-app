"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

interface ImportedInvoice {
  invoice_number: string;
  centre_name: string;
  amount: number;
  date: string;
  due_date: string;
}

/**
 * Import open invoices from QuickBooks CSV export.
 * One-time migration tool. Creates outbound_invoices records with status "sent".
 */
export async function importQuickBooksInvoices(
  invoices: ImportedInvoice[]
): Promise<{ data: { count: number } | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Verify admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return { data: null, error: "Admin access required." };
    }

    const admin = createSupabaseAdmin();

    // Get all centres for name matching
    const { data: centres } = await admin
      .from("centres")
      .select("id, name");

    const centreMap = new Map<string, string>();
    for (const centre of centres ?? []) {
      centreMap.set(centre.name.toLowerCase(), centre.id);
    }

    const records = [];
    const unmatchedCentres: string[] = [];

    for (const inv of invoices) {
      const centreId = centreMap.get(inv.centre_name.toLowerCase());
      if (!centreId) {
        unmatchedCentres.push(inv.centre_name);
        continue;
      }

      const amountCents = Math.round(inv.amount * 100);

      records.push({
        centre_id: centreId,
        period_start: inv.date,
        period_end: inv.date,
        line_items_json: [
          {
            session_id: "imported",
            date: inv.date,
            sport: "Various",
            coach_name: "Various",
            headcount: null,
            rate: inv.amount,
            amount: inv.amount,
            description: `Imported from QuickBooks — ${inv.invoice_number}`,
          },
        ],
        amount: inv.amount,
        status: "sent" as const,
        invoice_number: inv.invoice_number,
        created_by: user.id,
        sent_at: new Date().toISOString(),
        due_date: inv.due_date,
        subtotal_cents: amountCents,
        total_cents: amountCents,
      });
    }

    if (records.length === 0) {
      const msg = unmatchedCentres.length > 0
        ? `No centres matched. Unmatched: ${unmatchedCentres.join(", ")}`
        : "No valid invoices to import.";
      return { data: null, error: msg };
    }

    const { error: insertError } = await admin
      .from("outbound_invoices")
      .insert(records);

    if (insertError) return { data: null, error: insertError.message };

    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "quickbooks_invoices_imported",
      entity_type: "outbound_invoice",
      metadata: {
        count: records.length,
        unmatched_centres: unmatchedCentres,
        total_amount: records.reduce((s, r) => s + r.amount, 0),
      },
    });

    revalidatePath("/admin/invoicing/outbound");
    return { data: { count: records.length }, error: null };
  } catch (err) {
    console.error("importQuickBooksInvoices:", err);
    return { data: null, error: "Failed to import invoices." };
  }
}
