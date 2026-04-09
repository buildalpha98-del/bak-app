import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ParentShell } from "@/components/parent/parent-shell";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/parent-login");
  }

  const { data: parentProfile } = await supabase
    .from("parent_profiles")
    .select("first_name, last_name")
    .eq("user_id", user.id)
    .single();

  // If no parent profile, the middleware will handle redirecting to /parent/register
  // But we need to allow the register page to render without a profile
  const parentName = parentProfile
    ? `${parentProfile.first_name} ${parentProfile.last_name}`
    : "New Parent";

  return (
    <ParentShell parentName={parentName} userId={user.id}>
      {children}
    </ParentShell>
  );
}
