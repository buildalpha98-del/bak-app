import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getSessionsForFeedback } from "@/lib/client/feedback-actions";
import { FeedbackPageClient } from "./page-client";

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser();
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.centre_id !== centreId) redirect(`/client/${clientUser.centre_id}`);

  const sessions = await getSessionsForFeedback(centreId);

  const ratedCount = sessions.filter((s) => s.existingRating !== null).length;

  return (
    <FeedbackPageClient
      sessions={sessions}
      centreId={centreId}
      ratedCount={ratedCount}
      totalCount={sessions.length}
    />
  );
}
