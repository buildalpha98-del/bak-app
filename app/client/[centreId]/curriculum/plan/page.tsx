import { redirect } from "next/navigation";
import { ArrowLeft, CalendarRange } from "lucide-react";
import Link from "@/components/ui/app-link";
import { getCurrentClientUser, getPortalSchoolClasses } from "@/lib/client/actions";
import { scopeClasses } from "@/lib/client/assessment-scope";
import { getPlannableTerms } from "@/lib/client/term-plan-actions";
import { pickPlanningTerm, termTiming } from "@/lib/schools/plannable-terms";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import { frameworkOf } from "@/lib/curriculum/frameworks";
import { isSubjectKey } from "@/lib/curriculum/subjects";
import { TermPlanGenerator } from "@/components/client/term-plan-generator";

// Plan the term (migration 096): the AI drafts a class's Scope &
// Sequence for one subject, modelled on the Department's sample for the
// stage and restricted to the syllabus's real outcomes; the school
// reviews and saves it. Schools only; teachers see their own classes.

export default async function PlanTermPage({
  params,
  searchParams,
}: {
  params: Promise<{ centreId: string }>;
  searchParams: Promise<{ classId?: string; subject?: string; termId?: string }>;
}) {
  const { centreId } = await params;
  const sp = await searchParams;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.is_authorised_for_current === false)
    redirect(`/client/${clientUser.centre_id}`);
  if (clientUser.centre_type !== "school") redirect(`/client/${centreId}/curriculum`);

  const [{ data: classes }, terms] = await Promise.all([getPortalSchoolClasses(centreId), getPlannableTerms()]);
  const today = sydneyTodayIso();
  const term = pickPlanningTerm(terms, today, sp.termId);
  const termHref = (id: string) => {
    const q = new URLSearchParams({ termId: id });
    if (sp.classId) q.set("classId", sp.classId);
    if (sp.subject) q.set("subject", sp.subject);
    return `/client/${centreId}/curriculum/plan?${q.toString()}`;
  };
  const framework = frameworkOf(clientUser.centre_framework);

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <Link href={`/client/${centreId}/curriculum`} className="inline-flex items-center gap-1 text-sm text-portal-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Scope &amp; Sequence
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold font-heading text-foreground">
          <CalendarRange className="h-6 w-6 text-portal-500" />
          Plan the term
        </h1>
        <p className="text-muted-foreground mt-1">
          A term scope and sequence for one class and subject: the units, the weeks each runs, the {framework.outcomeNoun}s
          each addresses, assessment points, and a lesson focus for every week. Review it, save it, then write each
          week&apos;s lesson from it.
        </p>
      </div>

      {/* Which term: this one, or one Build Alpha Kids has opened ahead —
          next term's plan is written in the last weeks of this one. */}
      {term && (
        <nav aria-label="Term to plan" className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {terms.map((t) => {
              const on = t.id === term.id;
              return (
                <Link
                  key={t.id}
                  href={termHref(t.id)}
                  aria-current={on ? "page" : undefined}
                  className={`min-h-[44px] rounded-2xl border px-4 py-2 text-left text-sm transition-colors ${
                    on
                      ? "border-portal-600 bg-portal-600 text-white"
                      : "border-portal-200 bg-white text-foreground hover:bg-portal-50"
                  }`}
                >
                  <span className="block font-medium">{t.name}</span>{" "}
                  <span className={`block text-xs ${on ? "text-white/80" : "text-muted-foreground"}`}>
                    {termTiming(t, today)}
                  </span>
                </Link>
              );
            })}
          </div>
          {terms.length === 1 && (
            <p className="text-xs text-muted-foreground">
              Next term is not open for planning yet — it appears here as soon as Build Alpha Kids sets its dates.
            </p>
          )}
        </nav>
      )}

      {!term ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          There is no term open to plan. Ask Build Alpha Kids to open the next term.
        </div>
      ) : (
        <TermPlanGenerator
          key={term.id}
          centreId={centreId}
          classes={scopeClasses(classes, clientUser.class_ids)}
          term={term}
          frameworkLabel={framework.label}
          initialClassId={sp.classId}
          initialSubject={isSubjectKey(sp.subject) ? sp.subject : undefined}
        />
      )}
    </div>
  );
}
