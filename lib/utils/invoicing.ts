// ============================================================
// Invoice Utility Functions
// ============================================================

import { getFortnightlyPeriod } from "./payRates";

// ============================================================
// Types
// ============================================================

export interface FlaggedItem {
  session_id: string;
  issue: string;
  flagged_at: string;
}

// ============================================================
// Invoice Number
// ============================================================

/**
 * Generate a human-readable invoice number.
 * Format: BAK-COACH-{YYYYMM}-{NNN}
 */
export function generateInvoiceNumber(
  yearMonth: string,
  sequenceNumber: number
): string {
  const seq = String(sequenceNumber).padStart(3, "0");
  return `BAK-COACH-${yearMonth}-${seq}`;
}

// ============================================================
// GST Calculation
// ============================================================

/**
 * Calculate GST (10%) if the coach is registered.
 * Returns null gstAmount when not registered.
 */
export function calculateGST(
  subtotal: number,
  gstRegistered: boolean
): { gstAmount: number | null; total: number } {
  if (!gstRegistered) {
    return { gstAmount: null, total: subtotal };
  }
  const gstAmount = Math.round(subtotal * 0.1 * 100) / 100;
  const total = Math.round((subtotal + gstAmount) * 100) / 100;
  return { gstAmount, total };
}

// ============================================================
// Date Formatting
// ============================================================

/**
 * Format a date string to "13 Mar 2026" for invoice display.
 */
export function formatInvoiceDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ============================================================
// Fortnightly Period with Offset
// ============================================================

/**
 * Get a fortnightly period relative to the current one.
 * offset: 0 = current, -1 = previous, 1 = next, etc.
 */
export function getFortnightlyPeriodForOffset(offset: number): {
  start: Date;
  end: Date;
} {
  const now = new Date();
  // Shift the reference date by offset × 14 days
  const shifted = new Date(now);
  shifted.setDate(shifted.getDate() + offset * 14);
  return getFortnightlyPeriod(shifted);
}

// ============================================================
// Status Labels & Styles
// ============================================================

import type { CoachInvoiceStatus } from "@/lib/types/enums";

export const INVOICE_STATUS_CONFIG: Record<
  CoachInvoiceStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-600" },
  flagged: { label: "Flagged", className: "bg-amber-100 text-amber-700" },
  ready: { label: "Ready", className: "bg-emerald-100 text-emerald-700" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-700" },
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-700" },
};
