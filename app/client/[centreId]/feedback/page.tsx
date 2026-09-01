import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getSessionsForFeedback } from "@/lib/client/feedback-actions";
import { getClientPortalPulse } from "@/lib/client/status-pulse-actions";
import { FeedbackPageClient } from "./page-client";

export default async function FeedbackPage({
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

  const [sessions, pulse] = await Promise.all([
    getSessionsForFeedback(centreId),
    getClientPortalPulse(centreId),
  ]);

  const ratedCount = sessions.filter((s) => s.existingRating !== null).length;

  return (
    <FeedbackPageClient
      sessions={sessions}
      centreId={centreId}
      ratedCount={ratedCount}
      totalCount={sessions.length}
      pulse={pulse}
    />
  );
}
