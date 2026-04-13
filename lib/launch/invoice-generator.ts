"use server";

// ============================================================
// Launch Foundation — Invoice generation utilities
// Uses the admin Supabase client for cross-table queries
// ============================================================

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  CentreInvoiceCalculation,
  CentreInvoiceLineItem,
  SchoolInvoiceCalculation,
} from "./types";

// ========================
// generateInvoiceNumber — uses the invoice_number_seq sequence
// ========================
export async function generateInvoiceNumber(): Promise<string> {
  const supabase = createSupabaseAdmin();
  const year = new Date().getFullYear();

  const { data, error } = await supabase.rpc("nextval_invoice_number");

  if (error || !data) {
    // Fallback: generate from timestamp if sequence RPC is unavailable
    const fallback = Date.now().toString().slice(-4);
    return `BAK-${year}-${fallback}`;
  }

  const seq = String(data).padStart(4, "0");
  return `BAK-${year}-${seq}`;
}

// ========================
// calculateCentreInvoice
// ========================
export async function calculateCentreInvoice(params: {
  centreId: string;
  startDate: string;
  endDate: string;
}): Promise<CentreInvoiceCalculation> {
  const supabase = createSupabaseAdmin();

  // Get the centre's session rate
  const { data: centre } = await supabase
    .from("centres")
    .select("session_rate")
    .eq("id", params.centreId)
    .single();

  const sessionRate = centre?.session_rate ?? 165;

  // Get completed sessions in the date range
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, session_date, programme_name, start_time, end_time")
    .eq("centre_id", params.centreId)
    .eq("status", "completed")
    .gte("session_date", params.startDate)
    .lte("session_date", params.endDate)
    .order("session_date", { ascending: true });

  const lineItems: CentreInvoiceLineItem[] = (sessions || []).map(
    (s: { id: string; session_date: string; programme_name: string | null; start_time: string; end_time: string }) => ({
      sessionId: s.id,
      date: s.session_date,
      description: `${s.programme_name || "Coaching Session"} — ${s.session_date} (${s.start_time}–${s.end_time})`,
      quantity: 1,
      unitPrice: sessionRate,
      lineTotal: sessionRate,
    })
  );

  const subtotal = lineItems.reduce((sum: number, item) => sum + item.lineTotal, 0);
  const gstEnabled = process.env.BAK_GST_REGISTERED === "true";
  const gst = gstEnabled ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
  const total = subtotal + gst;

  return { lineItems, subtotal, gst, total };
}

// ========================
// calculateSchoolInvoice
// ========================
export async function calculateSchoolInvoice(params: {
  schoolId: string;
  termStartDate: string;
  termEndDate: string;
}): Promise<SchoolInvoiceCalculation> {
  const supabase = createSupabaseAdmin();
  const PRICE_PER_CHILD = 5;

  // Get completed sessions in the term
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, session_date, programme_name, start_time, end_time")
    .eq("school_id", params.schoolId)
    .eq("status", "completed")
    .gte("session_date", params.termStartDate)
    .lte("session_date", params.termEndDate)
    .order("session_date", { ascending: true });

  const lineItems: SchoolInvoiceCalculation["lineItems"] = [];

  for (const s of (sessions || []) as Array<{ id: string; session_date: string; programme_name: string | null; start_time: string; end_time: string }>) {
    // Count present + walk_in attendance for this session
    const { count } = await supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("session_id", s.id)
      .in("status", ["present", "walk_in"]);

    const childCount = count ?? 0;
    const lineTotal = childCount * PRICE_PER_CHILD;

    lineItems.push({
      sessionId: s.id,
      date: s.session_date,
      description: `${s.programme_name || "Coaching Session"} — ${s.session_date} (${childCount} children)`,
      childCount,
      unitPrice: PRICE_PER_CHILD,
      lineTotal,
    });
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const gstEnabled = process.env.BAK_GST_REGISTERED === "true";
  const gst = gstEnabled ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
  const total = subtotal + gst;

  return { lineItems, subtotal, gst, total };
}
