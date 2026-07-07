import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PayslipView } from "@/components/invoicing/payslip-view";
import type { CoachInvoice } from "@/lib/types/database";

// ============================================================
// /coach/invoicing/[id] — payslip detail
// ============================================================
//
// Coaches open this from their invoice history to see exactly how a
// pay run was calculated: per-session line items, adjustments, GST,
// and payment status. RLS (`coach_own_invoices`) already restricts
// reads to the coach's own rows; the explicit coach_id filter here is
// belt-and-braces so a copied URL can never leak another coach's pay.

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CoachPayslipPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: invoice }, { data: profile }] = await Promise.all([
    supabase
      .from("coach_invoices")
      .select("*")
      .eq("id", id)
      .eq("coach_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("name, email, abn, gst_registered")
      .eq("id", user.id)
      .single(),
  ]);

  if (!invoice) notFound();

  return (
    <PayslipView
      invoice={invoice as CoachInvoice}
      coach={
        profile ?? {
          name: null,
          email: user.email ?? "",
          abn: null,
          gst_registered: false,
        }
      }
    />
  );
}
