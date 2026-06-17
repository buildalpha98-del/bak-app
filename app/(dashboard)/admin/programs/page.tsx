import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPrograms } from "@/lib/programs/actions";
import { getProgramsStatusPulse } from "@/lib/programs/status-pulse-actions";
import { ProgramLibrary } from "@/components/programs/program-library";
import { ProgramsStatusPulseStrip } from "@/components/programs/programs-status-pulse";

export const metadata = {
  title: "Programmes | Build Alpha Kids",
};

export default async function AdminProgramsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: programs, error }, pulse] = await Promise.all([
    getPrograms(),
    getProgramsStatusPulse(),
  ]);

  if (error) {
    return (
      <div className="container max-w-6xl py-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  const list = programs ?? [];

  return (
    <div className="container max-w-6xl space-y-6 py-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Programmes</h1>
        <p className="text-sm text-muted-foreground">
          {list.length} programme{list.length === 1 ? "" : "s"} in the library.
          Generate session plans with AI or compose your own.
        </p>
      </div>

      <ProgramsStatusPulseStrip pulse={pulse} basePath="/admin/programs" />

      <ProgramLibrary programs={list} basePath="/admin/programs" />
    </div>
  );
}
