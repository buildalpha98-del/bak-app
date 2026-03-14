import { redirect } from "next/navigation";
import { BookOpen, CalendarDays } from "lucide-react";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getScopeAndSequence } from "@/lib/client/curriculum-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ScopeSequenceView } from "@/components/client/scope-sequence";

export default async function CurriculumPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser();
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.centre_id !== centreId) redirect(`/client/${clientUser.centre_id}`);

  // Fetch centre type
  const supabase = await createSupabaseServerClient();
  const { data: centre } = await supabase
    .from("centres")
    .select("type")
    .eq("id", centreId)
    .single();

  const centreType =
    (centre?.type as "childcare_centre" | "school" | null) ?? "childcare_centre";

  const { termName, weeks } = await getScopeAndSequence(centreId);

  const pageTitle =
    centreType === "school" ? "Scope & Sequence" : "Weekly Program Overview";

  return (
    <div className="animate-fade-up space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold font-heading text-foreground">
          <BookOpen className="h-6 w-6 text-teal-500" />
          {pageTitle}
        </h1>
        {termName && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            {termName}
          </p>
        )}
      </div>

      {/* Content */}
      {weeks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            No program data available
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Session programs will appear here once they have been set up for the
            current term.
          </p>
        </div>
      ) : (
        <ScopeSequenceView weeks={weeks} centreType={centreType} />
      )}
    </div>
  );
}
