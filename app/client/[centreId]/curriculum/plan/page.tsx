import { redirect } from "next/navigation";
import { ArrowLeft, CalendarRange } from "lucide-react";
import Link from "@/components/ui/app-link";
import { getCurrentClientUser, getPortalSchoolClasses } from "@/lib/client/actions";
import { scopeClasses } from "@/lib/client/assessment-scope";
import { getPlanningTerm } from "@/lib/client/term-plan-actions";
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
  searchParams: Promise<{ classId?: string; subject?: string }>;
}) {
  const { centreId } = await params;
  const sp = await searchParams;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.is_authorised_for_current === false)
    redirect(`/client/${clientUser.centre_id}`);
  if (clientUser.centre_type !== "school") redirect(`/client/${centreId}/curriculum`);

  const [{ data: classes }, term] = await Promise.all([getPortalSchoolClasses(centreId), getPlanningTerm()]);
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

      {!term ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          There is no active term to plan. Ask Build Alpha Kids to open the next term.
        </div>
      ) : (
        <TermPlanGenerator
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
