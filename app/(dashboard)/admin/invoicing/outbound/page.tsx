import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOutboundInvoices,
  getInvoiceSummary,
} from "@/lib/outbound-invoicing/actions";
import { OutboundInvoiceList } from "@/components/outbound-invoicing/invoice-list";
import { ApprovalQueue } from "@/components/outbound-invoicing/approval-queue";
import { Card, CardContent } from "@/components/ui/card";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

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
  const summaryResult = await getInvoiceSummary();

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
  const summary = summaryResult.data;

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
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Invoiced</p>
              <p className="text-lg font-semibold">
                {formatCurrency(summary.totalInvoicedThisMonth)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Paid</p>
              <p className="text-lg font-semibold text-green-700">
                {formatCurrency(summary.totalPaidThisMonth)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-lg font-semibold text-amber-700">
                {formatCurrency(summary.totalOutstanding)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-lg font-semibold text-red-700">
                {formatCurrency(summary.totalOverdue)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <ApprovalQueue invoices={pendingInvoices ?? []} />

      <OutboundInvoiceList
        invoices={allInvoices ?? []}
        basePath="/admin/invoicing/outbound"
      />
    </div>
  );
}
