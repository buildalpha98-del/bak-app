import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getParentKidsPulse } from "@/lib/parent/status-pulse-actions";
import ParentKidsClient from "./kids-client";

export default async function ParentKidsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/parent-login");

  const pulse = await getParentKidsPulse();

  return <ParentKidsClient initialPulse={pulse} />;
}
