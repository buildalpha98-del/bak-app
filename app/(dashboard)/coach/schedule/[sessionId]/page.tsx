import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getCoachSessionDetail } from "@/lib/sessions/coach-actions";
import { SessionDetailView } from "@/components/coach/schedule/session-detail-view";

interface SessionDetailPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionDetailPage({
  params,
}: SessionDetailPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { sessionId } = await params;
  const detailRes = await getCoachSessionDetail(sessionId, user.id);

  if (!detailRes.data) {
    notFound();
  }

  return (
    <SessionDetailView
      detail={detailRes.data}
      currentUserId={user.id}
    />
  );
}
