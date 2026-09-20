import { redirect } from "next/navigation";
import { frameworkOf } from "@/lib/curriculum/frameworks";
import { Sparkles } from "lucide-react";
import { getCurrentClientUser, getPortalSchoolClasses } from "@/lib/client/actions";
import { scopeClasses } from "@/lib/client/assessment-scope";
import { LessonGenerateForm } from "@/components/client/lesson-generate-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { termWeeks, weekStartFor } from "@/lib/schools/term-weeks";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

// Teachers write an English / Mathematics lesson with AI (migration
// 091) — schools only; a class teacher sees their own classes.

export default async function GenerateLessonPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.is_authorised_for_current === false)
    redirect(`/client/${clientUser.centre_id}`);
  if (clientUser.centre_type !== "school") redirect(`/client/${centreId}/programs`);

  const supabase = await createSupabaseServerClient();
  const [{ data: classes }, { data: term }] = await Promise.all([
    getPortalSchoolClasses(centreId),
    supabase.from("terms").select("name, start_date, end_date").eq("status", "active").limit(1).maybeSingle(),
  ]);
  const framework = frameworkOf(clientUser.centre_framework);
  const weeks = term ? termWeeks(term.start_date, term.end_date) : [];
  const defaultWeekStart = term ? weekStartFor(term.start_date, term.end_date, sydneyTodayIso()) : null;

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Generate a lesson</h1>
        <p className="text-muted-foreground mt-1">
          An English or Mathematics lesson for your class, aligned to the {framework.label}, written in about a minute.
          Review it, then save it to your school&apos;s library.
        </p>
      </div>

      <div className="rounded-xl border border-portal-200 bg-portal-50 p-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-portal-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-portal-800">
          Every lesson has a hook, explicit teaching with guided practice, an independent task with
          success criteria, and a reflection — each mapped to {framework.label} {framework.outcomeNoun} codes. You can regenerate
          until it fits, and download the saved plan as a PDF.
        </p>
      </div>

      <LessonGenerateForm
        centreId={centreId}
        frameworkKey={framework.key}
        classes={scopeClasses(classes, clientUser.class_ids)}
        termName={term?.name ?? null}
        termWeeks={weeks}
        defaultWeekStart={defaultWeekStart}
      />
    </div>
  );
}
