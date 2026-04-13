import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getInvoices } from "@/lib/launch/invoice-actions";
import { InvoiceManager } from "@/components/launch/invoice-manager";

export default async function GenerateInvoicesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch centres and schools for dropdowns
  const [centresRes, schoolsRes] = await Promise.all([
    supabase
      .from("centres")
      .select("id, name")
      .order("name"),
    supabase
      .from("schools")
      .select("id, name")
      .order("name"),
  ]);

  // Fetch existing invoices
  const invoices = await getInvoices();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-heading text-foreground">
        Generate Invoices
      </h1>
      <InvoiceManager
        centres={(centresRes.data ?? []) as Array<{ id: string; name: string }>}
        schools={(schoolsRes.data ?? []) as Array<{ id: string; name: string }>}
        initialInvoices={invoices}
        userId={user.id}
      />
    </div>
  );
}
