import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProgramGenerateForm } from "@/components/programs/program-generate-form";

export default async function AdminGenerateProgramPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <ProgramGenerateForm basePath="/admin/programs" />;
}
