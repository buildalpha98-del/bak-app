import type { createSupabaseAdmin } from "@/lib/supabase/admin";

// ============================================================
// Grants auto-deduction pipeline (Tier 3)
// ============================================================
//
// When month-end invoices are generated for a centre holding a funded
// (or approved) grant application with balance remaining, allocate the
// grant against the invoice automatically instead of waiting for
// someone to remember the manual Grants → Allocate flow. Mirrors
// allocateInvoiceToGrant's bookkeeping exactly (allocation row +
// amount_used bump + activity_log) and stays fully reversible through
// the existing removeAllocation action.

export interface GrantAppBalance {
  id: string;
  amount_approved: number | null;
  amount_used: number;
  funding_end_date: string | null;
}

export interface PlannedAllocation {
  grantApplicationId: string;
  amount: number;
}

/** Round to cents — allocations are dollars with 2dp in the schema. */
function toCents2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Split an invoice amount across a centre's grant applications.
 * Spends the soonest-expiring grant first (null end dates last), takes
 * min(remaining, still-owed) from each, and stops when the invoice is
 * covered or the grants run dry. Pure — unit-tested directly.
 */
export function planGrantAllocations(
  invoiceAmount: number,
  apps: GrantAppBalance[]
): PlannedAllocation[] {
  if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) return [];

  const ordered = [...apps].sort((a, b) => {
    if (a.funding_end_date === b.funding_end_date) return 0;
    if (a.funding_end_date === null) return 1;
    if (b.funding_end_date === null) return -1;
    return a.funding_end_date.localeCompare(b.funding_end_date);
  });

  const plan: PlannedAllocation[] = [];
  let owing = toCents2(invoiceAmount);

  for (const app of ordered) {
    if (owing <= 0) break;
    const remaining = toCents2(
      Number(app.amount_approved ?? 0) - Number(app.amount_used ?? 0)
    );
    if (remaining <= 0) continue;
    const take = toCents2(Math.min(remaining, owing));
    plan.push({ grantApplicationId: app.id, amount: take });
    owing = toCents2(owing - take);
  }

  return plan;
}

export interface AutoAllocateResult {
  /** Invoices that received at least one allocation. */
  invoicesCovered: number;
  /** Total dollars allocated across all invoices. */
  totalAllocated: number;
}

/**
 * Auto-allocate freshly generated invoices against their centres'
 * funded/approved grant balances. Skips any invoice that already has
 * an allocation (regeneration safety). Never throws — a grants hiccup
 * must not fail invoice generation.
 */
export async function autoAllocateGrantsForInvoices(
  admin: ReturnType<typeof createSupabaseAdmin>,
  invoices: Array<{ id: string; centre_id: string; amount: number }>,
  userId: string
): Promise<AutoAllocateResult> {
  const result: AutoAllocateResult = { invoicesCovered: 0, totalAllocated: 0 };
  try {
    if (invoices.length === 0) return result;

    const centreIds = Array.from(new Set(invoices.map((i) => i.centre_id)));
    const [{ data: apps }, { data: existing }] = await Promise.all([
      admin
        .from("grant_applications")
        .select("id, centre_id, status, amount_approved, amount_used, funding_end_date")
        .in("centre_id", centreIds)
        .in("status", ["funded", "approved"]),
      admin
        .from("grant_invoice_allocations")
        .select("invoice_id")
        .in("invoice_id", invoices.map((i) => i.id)),
    ]);

    const alreadyAllocated = new Set((existing ?? []).map((r) => r.invoice_id));
    const appsByCentre = new Map<string, GrantAppBalance[]>();
    for (const app of apps ?? []) {
      const list = appsByCentre.get(app.centre_id) ?? [];
      list.push({
        id: app.id,
        amount_approved: app.amount_approved,
        amount_used: Number(app.amount_used ?? 0),
        funding_end_date: app.funding_end_date,
      });
      appsByCentre.set(app.centre_id, list);
    }

    for (const invoice of invoices) {
      if (alreadyAllocated.has(invoice.id)) continue;
      const centreApps = appsByCentre.get(invoice.centre_id);
      if (!centreApps || centreApps.length === 0) continue;

      const plan = planGrantAllocations(Number(invoice.amount), centreApps);
      if (plan.length === 0) continue;

      for (const step of plan) {
        const { error: insertErr } = await admin
          .from("grant_invoice_allocations")
          .insert({
            grant_application_id: step.grantApplicationId,
            invoice_id: invoice.id,
            amount_allocated: step.amount,
            allocated_by: userId,
          });
        if (insertErr) continue;

        const app = centreApps.find((a) => a.id === step.grantApplicationId)!;
        app.amount_used = Math.round((app.amount_used + step.amount) * 100) / 100;
        await admin
          .from("grant_applications")
          .update({
            amount_used: app.amount_used,
            updated_at: new Date().toISOString(),
          })
          .eq("id", step.grantApplicationId);

        await admin.from("activity_log").insert({
          user_id: userId,
          action: "grant_invoice_auto_allocated",
          entity_type: "grant_application",
          entity_id: step.grantApplicationId,
          metadata: { invoice_id: invoice.id, amount: step.amount },
        });

        result.totalAllocated =
          Math.round((result.totalAllocated + step.amount) * 100) / 100;
      }
      result.invoicesCovered++;
    }

    return result;
  } catch (err) {
    console.error("autoAllocateGrantsForInvoices error:", err);
    return result;
  }
}
