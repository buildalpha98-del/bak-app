import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getSwapRequestsForOps,
  getSwapRequestHistory,
} from "@/lib/sessions/shift-actions";
import { SwapManagementView } from "@/components/roster/swap-management-view";

export default async function OpsSwapsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [pendingRes, historyRes] = await Promise.all([
    getSwapRequestsForOps(),
    getSwapRequestHistory(),
  ]);

  const firstError = pendingRes.error || historyRes.error;
  if (firstError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
    );
  }

  return (
    <SwapManagementView
      pendingSwaps={pendingRes.data ?? []}
      historySwaps={historyRes.data ?? []}
    />
  );
}
