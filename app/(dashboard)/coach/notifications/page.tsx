import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRecentNotifications } from "@/lib/notifications/actions";
import { NotificationsList } from "@/components/shared/notifications-list";

export default async function CoachNotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: notifications, error } = await getRecentNotifications(50);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <NotificationsList
        initialNotifications={notifications ?? []}
        userId={user.id}
        userRole="coach"
      />
    </div>
  );
}
