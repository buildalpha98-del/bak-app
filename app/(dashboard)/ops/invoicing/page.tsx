import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFlaggedInvoices, getAllCoachInvoices } from "@/lib/invoicing/actions";
import { getInvoicingStatusPulse } from "@/lib/invoicing/status-pulse-actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlaggedInvoicesList } from "@/components/invoicing/flagged-invoices-list";
import { AdminInvoiceList } from "@/components/invoicing/admin-invoice-list";
import { InvoicingStatusPulseStrip } from "@/components/invoicing/invoicing-status-pulse";

export default async function OpsInvoicingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [flaggedResult, allResult, pulse] = await Promise.all([
    getFlaggedInvoices(),
    getAllCoachInvoices(),
    getInvoicingStatusPulse(),
  ]);

  const firstError = flaggedResult.error || allResult.error;
  if (firstError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
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
          Coach Invoicing
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Resolve flagged invoices and review the full coach-invoice register.
        </p>
      </div>

      <InvoicingStatusPulseStrip pulse={pulse} basePath="/ops/invoicing" />

      <Tabs defaultValue="flagged">
        <TabsList>
          <TabsTrigger value="flagged">
            Flagged Reviews
            {flaggedResult.data.length > 0 && (
              <span className="ml-2 rounded-full bg-[#E8712A] px-2 py-0.5 text-xs text-white tabular-nums">
                {flaggedResult.data.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Coach Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="flagged" className="mt-4">
          <FlaggedInvoicesList invoices={flaggedResult.data} />
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <AdminInvoiceList
            invoices={allResult.data}
            showMarkPaid={false}
            basePath="/ops/invoicing"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
