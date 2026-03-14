import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientSessionDetail } from "@/lib/client/portal-actions";
import { ClientSessionDetail } from "@/components/client/client-session-detail";

export default async function ClientSessionPage({
  params,
}: {
  params: Promise<{ centreId: string; sessionId: string }>;
}) {
  const { centreId, sessionId } = await params;
  const { data: clientUser } = await getCurrentClientUser();

  if (!clientUser || clientUser.centre_id !== centreId) {
    redirect("/client-login");
  }

  const { data: session, error } = await getClientSessionDetail(sessionId, centreId);

  if (error || !session) {
    redirect(`/client/${centreId}/schedule`);
  }

  return (
    <div className="animate-fade-up">
      <ClientSessionDetail session={session} centreId={centreId} />
    </div>
  );
}
