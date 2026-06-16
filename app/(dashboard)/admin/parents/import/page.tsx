import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ParentCsvImportView } from "@/components/parent/csv-import-view";

export const metadata = {
  title: "Bulk Invite Parents — Build Alpha Kids",
};

export default async function AdminParentsImportPage() {
  // Page-level role gate. The server action also re-checks the caller's
  // role, but this avoids rendering the UI to coaches who'd just get an
  // error on submit.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    redirect("/admin");
  }

  return (
    <div className="container max-w-5xl py-6">
      <ParentCsvImportView />
    </div>
  );
}
