import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getParentBookingPulse } from "@/lib/parent/status-pulse-actions";
import { ParentBookClient } from "./book-client";

export default async function ParentBookPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/parent-login");

  const pulse = await getParentBookingPulse();

  return <ParentBookClient pulse={pulse} />;
}
