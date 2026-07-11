import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getSwapRequestsForOps,
  getSwapRequestHistory,
} from "@/lib/sessions/shift-actions";
import { SwapManagementView } from "@/components/roster/swap-management-view";
import { LoadError } from "@/components/ui/load-error";

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
      <LoadError message="Failed to load page data. Please try refreshing." />
    );
  }

  return (
    <SwapManagementView
      pendingSwaps={pendingRes.data ?? []}
      historySwaps={historyRes.data ?? []}
    />
  );
}
