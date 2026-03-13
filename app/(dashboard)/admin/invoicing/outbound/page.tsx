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

  const { data: allInvoices } = await getOutboundInvoices();
  const { data: pendingInvoices } = await getOutboundInvoices({
    status: ["pending_approval"],
  });
  const qbConnected = await isQuickBooksConnected();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">
            Outbound Invoices
          </h1>
          <p className="text-sm text-[#666666]">
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
