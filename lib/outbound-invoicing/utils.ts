import type { Centre } from "@/lib/types/database";

const PARENT_FUNDED_RATE = 10; // $10 per child per session
const PER_HEAD_RATE = 5; // $5 per child per session (schools)

/**
 * Calculate the invoice amount for a single session based on the centre's pricing model.
 */
export function calculateSessionAmount(
  pricingModel: Centre["pricing_model"],
  agreedRate: number | null,
  headcount: number | null
): number {
  switch (pricingModel) {
    case "centre_funded":
      return agreedRate ?? 0;
    case "parent_funded":
      return (headcount ?? 0) * PARENT_FUNDED_RATE;
    case "per_head":
      return (headcount ?? 0) * PER_HEAD_RATE;
    default:
      return 0;
  }
}

/**
 * Get the rate label for display purposes.
 */
export function getRateLabel(
  pricingModel: Centre["pricing_model"],
  agreedRate: number | null
): string {
  switch (pricingModel) {
    case "centre_funded":
      return `$${(agreedRate ?? 0).toFixed(2)}/session`;
    case "parent_funded":
      return `$${PARENT_FUNDED_RATE}/child`;
    case "per_head":
      return `$${PER_HEAD_RATE}/child`;
    default:
      return "N/A";
  }
}

/**
 * Generate the next outbound invoice number via the PostgreSQL function.
 * Must be called within a server context (uses Supabase admin client).
 */
export async function generateOutboundInvoiceNumber(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createSupabaseAdmin>,
  yearMonth: string
): Promise<string> {
  const { data, error } = await admin.rpc("next_outbound_invoice_number", {
    year_month: yearMonth,
  });
  if (error) throw new Error(`Failed to generate invoice number: ${error.message}`);
  return data as string;
}

/**
 * Format a date string to Australian display format: "15 Mar 2026"
 */
export function formatOutboundDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
