import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCommandCentreData } from "@/lib/ops/actions";
import { getOpsCommandPulse } from "@/lib/ops/command-pulse-actions";
import { OpsContextStrip } from "@/components/ops/ops-context-strip";
import { OpsQuickActionsRow } from "@/components/ops/ops-quick-actions-row";
import { CommandCentre } from "./command-centre";
import { LoadError } from "@/components/ui/load-error";

export const dynamic = "force-dynamic";

export default async function OpsCommandCentrePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || (profile.role !== "ops" && profile.role !== "admin")) {
    redirect("/");
  }

  // Single fan-out: command centre + pulse + greeting context all
  // resolve in parallel so LCP is bounded by the slowest sub-query.
  let data;
  let pulse;
  try {
    [data, pulse] = await Promise.all([
      getCommandCentreData(user.id),
      getOpsCommandPulse(),
    ]);
  } catch {
    return (
      <LoadError message="Failed to load command centre data. Please try refreshing." />
    );
  }

  const firstName = (profile.name ?? "").split(" ")[0] || "there";

  return (
    <div className="space-y-6 animate-fade-up">
      <OpsContextStrip firstName={firstName} pulse={pulse} />
      <OpsQuickActionsRow />
      <CommandCentre {...data} userId={user.id} />
    </div>
  );
}
