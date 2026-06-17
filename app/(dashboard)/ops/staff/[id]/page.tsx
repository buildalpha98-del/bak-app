import { notFound } from "next/navigation";
import { getStaffMember } from "@/lib/staff/actions";
import { StaffDetailView } from "@/components/staff/staff-detail-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPushSubscriptionCount } from "@/lib/push/actions";

interface StaffDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OpsStaffDetailPage({ params }: StaffDetailPageProps) {
  const { id } = await params;
  const { data, error } = await getStaffMember(id);

  if (error || !data) {
    notFound();
  }

  // Push opt-in is per-browser; surface the card only when the ops
  // user is looking at their own row.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isSelf = !!user && user.id === id;
  const selfPushCount = isSelf ? await getPushSubscriptionCount(user.id) : null;

  return <StaffDetailView data={data} selfPushCount={selfPushCount} />;
}
