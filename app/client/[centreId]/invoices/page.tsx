import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientInvoices } from "@/lib/client/portal-actions";
import { ClientInvoices } from "@/components/client/client-invoices";

export default async function ClientInvoicesPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser();
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.centre_id !== centreId) redirect(`/client/${clientUser.centre_id}`);

  const { data, error } = await getClientInvoices(centreId);

  if (error) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold font-heading text-foreground">Invoices</h1>
        <p className="mt-4 text-muted-foreground">
          Unable to load invoices. Please try again later.
        </p>
      </div>
    );
  }

  return <ClientInvoices invoices={data} />;
}
