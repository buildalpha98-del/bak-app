import { redirect } from "next/navigation";
import { BookOpen, CalendarDays, CalendarRange, Download, ListChecks } from "lucide-react";
import Link from "@/components/ui/app-link";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getScopeAndSequence } from "@/lib/client/curriculum-actions";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ScopeSequenceView } from "@/components/client/scope-sequence";
import { TermPlanCard } from "@/components/client/term-plan-card";
import { getPlannableTerms, getTermPlans } from "@/lib/client/term-plan-actions";
import { termTiming } from "@/lib/schools/plannable-terms";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

export default async function CurriculumPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  // Multi-campus: authorisation comes from the join table, not the
  // default centre. Bounce only when genuinely unauthorised.
  if (clientUser.is_authorised_for_current === false)
    redirect(`/client/${clientUser.centre_id}`);

  // Fetch centre type
  const admin = createSupabaseAdmin();
  const { data: centre } = await admin
    .from("centres")
    .select("type")
    .eq("id", centreId)
    .single();

  const centreType =
    (centre?.type as "childcare_centre" | "school" | null) ?? "childcare_centre";

  // Plans for this term and any coming term the school has planned ahead.
  const today = sydneyTodayIso();
  const [{ termName, weeks }, planTerms] = await Promise.all([
    getScopeAndSequence(centreId),
    centreType === "school" ? getPlannableTerms() : Promise.resolve([]),
  ]);
  const termPlanSets = (await Promise.all(planTerms.map((t) => getTermPlans(centreId, t.id)))).filter(
    (set) => set.term && set.plans.length > 0
  );

  const pageTitle =
    centreType === "school" ? "Scope & Sequence" : "Weekly Program Overview";

  return (
    <div className="animate-fade-up space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold font-heading text-foreground">
            <BookOpen className="h-6 w-6 text-portal-500" />
            {pageTitle}
          </h1>
          {termName && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {termName}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {centreType === "school" && (
          <Link
            href={`/client/${centreId}/curriculum/plan`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-portal-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-portal-700"
          >
            <CalendarRange className="h-4 w-4" />
            <span className="hidden sm:inline">Plan the term</span>
            <span className="sm:hidden">Plan</span>
          </Link>
        )}
        {centreType === "school" && (
          <Link
            href={`/client/${centreId}/curriculum/outcomes`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl border border-portal-200 px-3 py-2 text-sm font-medium text-portal-800 transition-colors hover:bg-portal-50"
          >
            <ListChecks className="h-4 w-4 text-portal-600" />
            <span className="hidden sm:inline">Curriculum reference</span>
            <span className="sm:hidden">Outcomes</span>
          </Link>
        )}
        {/* The written programme of record — full session plans and
            outcome mapping as a filing-cabinet-ready PDF. */}
        {weeks.length > 0 && (
          <a
            href={`/api/client/${centreId}/scope-sequence-pdf`}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-2xl border border-portal-200 bg-portal-50 px-3 py-2 text-sm font-medium text-portal-800 transition-colors hover:bg-portal-100"
          >
            <Download className="h-4 w-4 text-portal-600" />
            <span className="hidden sm:inline">Download {pageTitle} (PDF)</span>
            <span className="sm:hidden">PDF</span>
          </a>
        )}
        </div>
      </div>

      {/* Term plans (migration 096): the programme of record for each
          class × subject this term, drafted by the AI and approved here. */}
      {termPlanSets.map((set) => (
        <section key={set.term!.id} className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Term plans
            {(termPlanSets.length > 1 || set.term!.status !== "active") && (
              <>
                {" "}
                <span className="font-normal text-muted-foreground">
                  — {set.term!.name} · {termTiming(set.term!, today)}
                </span>
              </>
            )}
          </h2>
          {set.plans.map((p) => (
            <TermPlanCard key={p.id} plan={p} centreId={centreId} term={set.term} canApprove={clientUser.is_primary} />
          ))}
        </section>
      ))}

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
