import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientPrograms } from "@/lib/client/portal-actions";
import { ClientPrograms } from "@/components/client/client-programs";

export default async function ClientProgramsPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser();
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.centre_id !== centreId) redirect(`/client/${clientUser.centre_id}`);

  const { data, error } = await getClientPrograms(centreId);

  if (error) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold font-heading text-foreground">Programs</h1>
        <p className="mt-4 text-muted-foreground">
          Unable to load programs. Please try again later.
        </p>
      </div>
    );
  }

  return <ClientPrograms programs={data} centreId={centreId} />;
}
