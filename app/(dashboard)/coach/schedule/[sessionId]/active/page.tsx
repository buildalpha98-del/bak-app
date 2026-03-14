import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSessionData } from "@/lib/sessions/session-workflow-actions";
import { ActiveSessionView } from "@/components/coach/session/active-session-view";
import { CompletedSessionSummary } from "@/components/coach/session/completed-session-summary";

interface ActiveSessionPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function ActiveSessionPage({
  params,
}: ActiveSessionPageProps) {
  const { sessionId } = await params;

  // Auth guard
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch session data
  const { data, error } = await getActiveSessionData(sessionId, user.id);

  if (error || !data) {
    redirect(`/coach/schedule/${sessionId}`);
  }

  // Completed → read-only summary
  if (data.session.status === "completed") {
    return <CompletedSessionSummary data={data} />;
  }

  // Not in_progress → redirect to detail page
  if (data.session.status !== "in_progress") {
    redirect(`/coach/schedule/${sessionId}`);
  }

  return <ActiveSessionView data={data} />;
}
