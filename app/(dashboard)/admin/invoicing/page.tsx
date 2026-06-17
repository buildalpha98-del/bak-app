import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAllCoachInvoices } from "@/lib/invoicing/actions";
import { getInvoicingStatusPulse } from "@/lib/invoicing/status-pulse-actions";
import { AdminInvoiceList } from "@/components/invoicing/admin-invoice-list";
import { InvoicingStatusPulseStrip } from "@/components/invoicing/invoicing-status-pulse";

export default async function AdminInvoicingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: invoices, error }, pulse] = await Promise.all([
    getAllCoachInvoices(),
    getInvoicingStatusPulse(),
  ]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#E8712A] mb-1">
          Finance
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight">
          Coach Invoices
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Review, approve, and pay coach invoices across fortnightly periods.
        </p>
      </div>

      <InvoicingStatusPulseStrip pulse={pulse} basePath="/admin/invoicing" />

      <AdminInvoiceList
        invoices={invoices}
        showMarkPaid
        basePath="/admin/invoicing"
      />
    </div>
  );
}
