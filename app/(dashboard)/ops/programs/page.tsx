import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrograms } from "@/lib/programs/actions";
import { ProgramLibrary } from "@/components/programs/program-library";

export default async function OpsProgramsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: programs, error } = await getPrograms();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold font-heading text-foreground">Programmes</h1>
          <p className="text-sm text-muted-foreground">
            AI-generated coaching session plans.
          </p>
        </div>
        <Link
          href="/ops/programs/generate"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          Generate Programme
        </Link>
      </div>

      <div className="mt-6">
        <ProgramLibrary programs={programs ?? []} basePath="/ops/programs" />
      </div>
    </div>
  );
}
