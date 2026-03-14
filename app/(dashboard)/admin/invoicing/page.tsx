import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAllCoachInvoices } from "@/lib/invoicing/actions";
import { AdminInvoiceList } from "@/components/invoicing/admin-invoice-list";

export default async function AdminInvoicingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: invoices, error } = await getAllCoachInvoices();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <h1 className="text-2xl font-bold font-heading text-foreground">Coach Invoices</h1>
      <AdminInvoiceList invoices={invoices} showMarkPaid />
    </div>
  );
}
