"use client";

// School portal Assessments (migration 088): one card per class × sport
// this term, each opening either the class grid (desktop, whole class at
// once) or the one-by-one star flow (phones). Unscoped viewers — the
// principal and colleagues — also get a progress table across classes.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, LayoutGrid, Smartphone, Users } from "lucide-react";
import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { saveClientChildRating } from "@/lib/client/assessment-actions";
import {
  AssessmentRatingFlow,
  type RatingFlowTask,
} from "@/components/assessments/assessment-rating-flow";

export function ClientAssessmentsView({
  centreId,
  tasks,
  scopedToClasses,
}: {
  centreId: string;
  tasks: RatingFlowTask[];
  scopedToClasses: boolean;
}) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (activeIndex !== null) {
    return (
      <AssessmentRatingFlow
        tasks={tasks}
        initialTaskIndex={activeIndex}
        onExit={() => {
          setActiveIndex(null);
          router.refresh();
        }}
        save={(input) => saveClientChildRating(centreId, input)}
        noun="students"
        showCentreName={false}
      />
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        {scopedToClasses
          ? "Nothing to assess for your classes this term yet — Build Alpha Kids sets up the skills for each sport at the start of term."
          : "Nothing to assess this term yet — Build Alpha Kids sets up the skills for each sport at the start of term."}
      </div>
    );
  }

  const totalStudents = tasks.reduce((n, t) => n + t.children.length, 0);
  const totalDone = tasks.reduce((n, t) => n + t.children.filter((c) => c.already_rated).length, 0);

  return (
    <div className="space-y-6">
      {!scopedToClasses && tasks.length > 1 && (
        <div className="overflow-x-auto rounded-xl border border-portal-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-portal-50 text-xs uppercase tracking-wide text-portal-800">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Class</th>
                <th className="px-3 py-2 text-left font-semibold">Sport</th>
                <th className="px-3 py-2 text-right font-semibold">Assessed</th>
                <th className="px-3 py-2 text-left font-semibold">Progress</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const done = t.children.filter((c) => c.already_rated).length;
                const pct = t.children.length ? Math.round((done / t.children.length) * 100) : 0;
                return (
                  <tr key={`${t.template_id}-${t.class_id ?? "all"}`} className="border-t border-portal-100">
                    <td className="px-3 py-2 font-medium">{t.class_name ?? "Not in a class"}</td>
                    <td className="px-3 py-2">{t.sport}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {done} / {t.children.length}
                    </td>
                    <td className="px-3 py-2">
                      <div className="h-1.5 w-40 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-portal-200 bg-portal-50/50 font-medium">
                <td className="px-3 py-2" colSpan={2}>
                  Whole school
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {totalDone} / {totalStudents}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {totalStudents ? Math.round((totalDone / totalStudents) * 100) : 0}% of this term&apos;s assessments done
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {tasks.map((task, i) => {
          const done = task.children.filter((c) => c.already_rated).length;
          const total = task.children.length;
          return (
            <Card key={`${task.template_id}-${task.class_id ?? "all"}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    {task.class_name ?? `${task.sport} · not in a class`}
                  </CardTitle>
                  <Badge variant="secondary" className="shrink-0">
                    {task.age_group} yrs
                  </Badge>
                </div>
                <CardDescription className="flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5" />
                  {task.sport} · {task.term_name} · {task.skills.length} skills
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {done} of {total} students assessed
                </div>
                {total > 0 && (
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(done / total) * 100}%` }} />
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {task.class_id && (
                    <Button
                      render={<Link href={`/client/${centreId}/assessments/${task.class_id}/${task.template_id}`} />}
                      className="min-h-[44px]"
                    >
                      <LayoutGrid className="h-4 w-4 mr-1.5" /> Open class grid
                    </Button>
                  )}
                  <Button variant="outline" className="min-h-[44px]" onClick={() => setActiveIndex(i)}>
                    <Smartphone className="h-4 w-4 mr-1.5" /> Rate one by one
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
