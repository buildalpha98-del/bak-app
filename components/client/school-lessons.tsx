// The school's own lesson library on the portal's Programs page
// (migration 091), above the programmes Build Alpha Kids delivered.

import { BookOpenCheck, Download, Sparkles } from "lucide-react";
import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { subjectOf } from "@/lib/curriculum/subjects";
import type { SchoolLesson } from "@/lib/client/lesson-actions";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: SYDNEY_TZ,
  });
}

export function SchoolLessons({
  centreId,
  lessons,
}: {
  centreId: string;
  lessons: SchoolLesson[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold font-heading text-foreground">Your school&apos;s lessons</h2>
          <p className="text-sm text-muted-foreground">
            PDHPE, English and Mathematics lessons your teachers have written with AI.
          </p>
        </div>
        <Button render={<Link href={`/client/${centreId}/programs/generate`} />} className="min-h-[44px]">
          <Sparkles className="h-4 w-4 mr-1.5" /> Generate a lesson
        </Button>
      </div>

      {lessons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-portal-200 bg-card p-6 text-center text-sm text-muted-foreground">
          No lessons yet. Generate the first one — pick a focus area and a class, and it&apos;s written
          in about a minute.
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {lessons.map((l) => (
            <li key={l.id} className="rounded-xl border border-portal-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/client/${centreId}/programs/${l.id}`} className="font-medium text-foreground hover:underline">
                  {l.title}
                </Link>
                <Badge variant="outline" className="shrink-0">{subjectOf(l.subject).label}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {l.focus} · {l.duration_minutes} min
                {l.class_name ? ` · ${l.class_name}` : l.age_group ? ` · ages ${l.age_group}` : ""}
                {l.author_name ? ` · ${l.author_name}` : ""} · {fmtDate(l.created_at)}
                {l.planned_for ? ` · on the Scope & Sequence, week of ${fmtDate(`${l.planned_for}T12:00:00Z`)}` : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/client/${centreId}/programs/${l.id}`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-input px-3 text-sm"
                >
                  <BookOpenCheck className="h-4 w-4" /> Open
                </Link>
                <a
                  href={`/api/client/${centreId}/lesson-pdf?programId=${l.id}`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-input px-3 text-sm"
                >
                  <Download className="h-4 w-4" /> PDF
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
