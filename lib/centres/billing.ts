// ============================================================
// Billing classification — who pays, and how they're invoiced
// ============================================================
//
// Two facts per client, colour-coded the same way everywhere:
//   - who pays: `pricing_model` — centre_funded and per_head are paid by
//     the service (school / centre), parent_funded by families;
//   - invoiced via: `invoiced_via` (migration 103) — Square or QuickBooks,
//     null when nobody has set it yet.
//
// Colours are fixed hexes (not centre colours) so a legend means the
// same thing on every screen.

import type { InvoiceChannel, PricingModel } from "@/lib/types/enums";

export type Payer = "service" | "parent";

export function payerOf(pricingModel: string | null | undefined): Payer {
  return pricingModel === "parent_funded" ? "parent" : "service";
}

export const PAYER_STYLE: Record<Payer, { label: string; colour: string; badge: string }> = {
  service: { label: "Service paid", colour: "#0284C7", badge: "border-sky-200 bg-sky-50 text-sky-800" },
  parent: { label: "Parent paid", colour: "#7C3AED", badge: "border-violet-200 bg-violet-50 text-violet-800" },
};

/** "Service paid · per head" — the per-head model is still the service paying. */
export function payerLabel(pricingModel: string | null | undefined): string {
  const base = PAYER_STYLE[payerOf(pricingModel)].label;
  return pricingModel === "per_head" ? `${base} · per head` : base;
}

export type ChannelKey = InvoiceChannel | "unset";

export function channelOf(invoicedVia: string | null | undefined): ChannelKey {
  return invoicedVia === "square" || invoicedVia === "quickbooks" ? invoicedVia : "unset";
}

export const CHANNEL_STYLE: Record<ChannelKey, { label: string; colour: string; badge: string }> = {
  square: { label: "Square", colour: "#1F2937", badge: "border-gray-300 bg-gray-100 text-gray-900" },
  quickbooks: { label: "QuickBooks", colour: "#2CA01C", badge: "border-green-200 bg-green-50 text-green-800" },
  unset: { label: "Invoicing not set", colour: "#9CA3AF", badge: "border-dashed border-gray-300 bg-transparent text-muted-foreground" },
};

export const INVOICE_CHANNEL_OPTIONS: { value: InvoiceChannel; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "quickbooks", label: "QuickBooks" },
];

export const PRICING_MODELS: PricingModel[] = ["centre_funded", "per_head", "parent_funded"];
