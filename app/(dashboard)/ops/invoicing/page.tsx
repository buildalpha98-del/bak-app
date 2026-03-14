import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFlaggedInvoices, getAllCoachInvoices } from "@/lib/invoicing/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlaggedInvoicesList } from "@/components/invoicing/flagged-invoices-list";
import { AdminInvoiceList } from "@/components/invoicing/admin-invoice-list";

export default async function OpsInvoicingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [flaggedResult, allResult] = await Promise.all([
    getFlaggedInvoices(),
    getAllCoachInvoices(),
  ]);

  const firstError = flaggedResult.error || allResult.error;
  if (firstError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <h1 className="text-2xl font-bold font-heading text-foreground">Coach Invoicing</h1>

      <Tabs defaultValue="flagged">
        <TabsList>
          <TabsTrigger value="flagged">
            Flagged Reviews
            {flaggedResult.data.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">
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
          <AdminInvoiceList invoices={allResult.data} showMarkPaid={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
