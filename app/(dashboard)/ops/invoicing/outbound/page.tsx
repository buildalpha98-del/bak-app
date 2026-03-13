import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOutboundInvoices } from "@/lib/outbound-invoicing/actions";
import { isQuickBooksConnected } from "@/lib/quickbooks/client";
import { OutboundInvoiceList } from "@/components/outbound-invoicing/invoice-list";
import { GenerateInvoicesDialog } from "@/components/outbound-invoicing/generate-invoices-dialog";
import { PaymentSyncButton } from "@/components/outbound-invoicing/payment-sync-button";

export default async function OpsOutboundInvoicingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: invoices, error } = await getOutboundInvoices();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const qbConnected = await isQuickBooksConnected();

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Outbound Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Generate and manage invoices to centres and schools.
          </p>
        </div>
        <div className="flex gap-2">
          {qbConnected && <PaymentSyncButton />}
          <GenerateInvoicesDialog />
        </div>
      </div>

      <OutboundInvoiceList
        invoices={invoices ?? []}
        basePath="/ops/invoicing/outbound"
      />
    </div>
  );
}
