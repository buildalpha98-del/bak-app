import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOutboundInvoices } from "@/lib/outbound-invoicing/actions";
import { isQuickBooksConnected } from "@/lib/quickbooks/client";
import { OutboundInvoiceList } from "@/components/outbound-invoicing/invoice-list";
import { ApprovalQueue } from "@/components/outbound-invoicing/approval-queue";
import { PaymentSyncButton } from "@/components/outbound-invoicing/payment-sync-button";

export default async function AdminOutboundInvoicingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const allResult = await getOutboundInvoices();
  const pendingResult = await getOutboundInvoices({
    status: ["pending_approval"],
  });

  const firstError = allResult.error || pendingResult.error;
  if (firstError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
    );
  }

  const allInvoices = allResult.data;
  const pendingInvoices = pendingResult.data;
  const qbConnected = await isQuickBooksConnected();

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">
            Outbound Invoices
          </h1>
          <p className="text-sm text-muted-foreground">
            Review, approve, and manage invoices to centres and schools.
          </p>
        </div>
        {qbConnected && <PaymentSyncButton />}
      </div>

      <ApprovalQueue invoices={pendingInvoices ?? []} />

      <OutboundInvoiceList
        invoices={allInvoices ?? []}
        basePath="/admin/invoicing/outbound"
      />
    </div>
  );
}
