// The school's knowledge checks on the Assessments page (migration 092).

import { ListChecks } from "lucide-react";
import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { subjectOf } from "@/lib/curriculum/subjects";
import type { SchoolQuiz } from "@/lib/client/quiz-actions";

export function SchoolQuizzes({ centreId, quizzes }: { centreId: string; quizzes: SchoolQuiz[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold font-heading text-foreground">Knowledge checks</h2>
        <p className="text-sm text-muted-foreground">
          Short quizzes written from your lessons — print the student copy, mark the sheet, and the
          results land on each student&apos;s page and report card. Create one from any lesson under Programs.
        </p>
      </div>
      {quizzes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-portal-200 bg-card p-5 text-sm text-muted-foreground">
          No quizzes yet. Open one of your school&apos;s lessons and choose &ldquo;Create a quiz for this lesson&rdquo;.
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {quizzes.map((q) => (
            <li key={q.id} className="rounded-xl border border-portal-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/client/${centreId}/quizzes/${q.id}`} className="font-medium text-foreground hover:underline">
                  {q.title}
                </Link>
                <Badge variant="outline" className="shrink-0">{subjectOf(q.subject).label}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {q.focus} · ages {q.age_band} · {q.question_count} questions · {q.marked_count} marked
                {q.author_name ? ` · ${q.author_name}` : ""}
              </p>
              <Link
                href={`/client/${centreId}/quizzes/${q.id}`}
                className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-input px-3 text-sm"
              >
                <ListChecks className="h-4 w-4" /> Open marking sheet
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
