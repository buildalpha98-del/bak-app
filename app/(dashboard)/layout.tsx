import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/shared/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // No staff profile — check if this is a parent user.
    // Parent portal users have parent_profiles, not profiles.
    // The parent layout (parent/layout.tsx) handles its own auth and shell.
    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (parentProfile) {
      // Parent user — skip DashboardShell, the nested parent layout provides ParentShell
      return <>{children}</>;
    }

    // Not a staff user and not a parent — redirect to login
    redirect("/login");
  }

  if (profile.status === "onboarding") {
    redirect("/set-password");
  }

  return <DashboardShell profile={profile}>{children}</DashboardShell>;
}
