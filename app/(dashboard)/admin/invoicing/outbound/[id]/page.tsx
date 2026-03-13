import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOutboundInvoiceDetail } from "@/lib/outbound-invoicing/actions";
import { isQuickBooksConnected } from "@/lib/quickbooks/client";
import { InvoiceDetail } from "@/components/outbound-invoicing/invoice-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminInvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: invoice, error } = await getOutboundInvoiceDetail(id);

  if (error || !invoice) notFound();

  const qbConnected = await isQuickBooksConnected();

  return (
    <div className="space-y-6">
      <InvoiceDetail
        invoice={invoice}
        userRole="admin"
        qbConnected={qbConnected}
      />
    </div>
  );
}
