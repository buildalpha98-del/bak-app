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

  const data = await getCommandCentreData(user.id);

  return <CommandCentre {...data} userId={user.id} />;
}
