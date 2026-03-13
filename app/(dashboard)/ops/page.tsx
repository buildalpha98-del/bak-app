import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCommandCentreData } from "@/lib/ops/actions";
import { CommandCentre } from "./command-centre";

export default async function OpsCommandCentrePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "ops" && profile.role !== "admin")) {
    redirect("/");
  }

  let data;
  try {
    data = await getCommandCentreData(user.id);
  } catch {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load command centre data. Please try refreshing.
      </div>
    );
  }

  return <CommandCentre {...data} userId={user.id} />;
}
