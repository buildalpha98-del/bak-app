import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listCustomSports,
  listCustomEquipment,
} from "@/lib/programs/custom-taxonomy-actions";
import { CustomTaxonomyManager } from "@/components/admin/custom-taxonomy-manager";

export default async function AdminCustomTaxonomyPage() {
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
  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    redirect("/");
  }

  const [sportsRes, equipmentRes] = await Promise.all([
    listCustomSports(),
    listCustomEquipment(),
  ]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-semibold">Custom Sports &amp; Equipment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Items added here become available to everyone in the
          program-generation form. Rename or delete sparingly — programs
          already saved against these names keep their text.
        </p>
      </div>
      <CustomTaxonomyManager
        initialSports={sportsRes.data ?? []}
        initialEquipment={equipmentRes.data ?? []}
      />
    </div>
  );
}
