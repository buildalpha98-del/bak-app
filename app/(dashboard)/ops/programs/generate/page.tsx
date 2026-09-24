import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProgramGenerateForm } from "@/components/programs/program-generate-form";

// `?sport=&bands=8-12,12-16&weeks=10` prefills a library gap the term board
// or programmes page pointed at.
export default async function OpsGenerateProgramPage({ searchParams }: { searchParams: Promise<{ sport?: string; bands?: string; weeks?: string }> }) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <ProgramGenerateForm
      basePath="/ops/programs"
      initial={{
        sport: sp.sport?.slice(0, 64),
        ageGroups: sp.bands ? sp.bands.split(",") : undefined,
        weeks: sp.weeks ? Number(sp.weeks) : undefined,
      }}
    />
  );
}
