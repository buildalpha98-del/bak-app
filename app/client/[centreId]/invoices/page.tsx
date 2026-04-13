import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientInvoices } from "@/lib/client/portal-actions";
import { getInvoices as getLaunchInvoices } from "@/lib/launch/invoice-actions";
import { ClientInvoices } from "@/components/client/client-invoices";
import { LaunchClientInvoices } from "@/components/launch/client-launch-invoices";

export default async function ClientInvoicesPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser();
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser!.centre_id !== centreId) redirect(`/client/${clientUser!.centre_id}`);

  const [outboundRes, launchInvoices] = await Promise.all([
    getClientInvoices(centreId),
    getLaunchInvoices({ centreId }),
  ]);

  // Filter launch invoices to only show sent/paid/overdue (not draft)
  const visibleLaunchInvoices = launchInvoices.filter(
    (inv) => inv.status !== "draft"
  );

  return (
    <div className="space-y-8">
      {/* Existing outbound invoices */}
      {!outboundRes.error && (
        <ClientInvoices invoices={outboundRes.data} />
      )}

      {/* Launch foundation invoices */}
      {visibleLaunchInvoices.length > 0 && (
        <LaunchClientInvoices invoices={visibleLaunchInvoices} />
      )}

      {/* Show error or empty state if both are empty */}
      {outboundRes.error && visibleLaunchInvoices.length === 0 && (
        <div className="animate-fade-up">
          <h1 className="text-2xl font-bold font-heading text-foreground">Invoices</h1>
          <p className="mt-4 text-muted-foreground">
            Unable to load invoices. Please try again later.
          </p>
        </div>
      )}
    </div>
  );
}
