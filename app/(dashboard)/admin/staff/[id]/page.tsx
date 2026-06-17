import { notFound } from "next/navigation";
import { getStaffMember } from "@/lib/staff/actions";
import { StaffDetailView } from "@/components/staff/staff-detail-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPushSubscriptionCount } from "@/lib/push/actions";

interface StaffDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function StaffDetailPage({ params }: StaffDetailPageProps) {
  const { id } = await params;
  const { data, error } = await getStaffMember(id);

  if (error || !data) {
    notFound();
  }

  // Only show the push opt-in card when the admin is viewing their
  // own row -- subscriptions are per-browser, so we can't enable
  // push for someone else's device from this surface.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isSelf = !!user && user.id === id;
  const selfPushCount = isSelf ? await getPushSubscriptionCount(user.id) : null;

  // Only admins land on /admin/staff/[id] (the DashboardShell would
  // redirect ops to /ops). The financial-access toggle is admin-only.
  return (
    <StaffDetailView
      data={data}
      canEditFinancialAccess
      selfPushCount={selfPushCount}
    />
  );
}
