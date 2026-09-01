import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientSchedule } from "@/lib/client/portal-actions";
import { ClientSchedule } from "@/components/client/client-schedule";

export default async function ClientSchedulePage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  // Multi-campus: authorisation comes from the join table, not the
  // default centre. Bounce only when genuinely unauthorised.
  if (clientUser.is_authorised_for_current === false)
    redirect(`/client/${clientUser.centre_id}`);

  const [upcomingResult, pastResult] = await Promise.all([
    getClientSchedule(centreId, "upcoming"),
    getClientSchedule(centreId, "past"),
  ]);

  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-bold font-heading text-foreground">Schedule</h1>
      <p className="mt-1 text-muted-foreground">
        View your upcoming and past coaching sessions.
      </p>

      <div className="mt-6">
        <ClientSchedule
          upcoming={upcomingResult.data}
          past={pastResult.data}
          centreId={centreId}
        />
      </div>
    </div>
  );
}
