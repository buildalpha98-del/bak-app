import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ImportManager } from "@/components/launch/import-manager";

export default async function AdminImportPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Import Data
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bulk import centres, schools, and coaches from CSV files.
        </p>
      </div>
      <ImportManager userId={user.id} />
    </div>
  );
}
