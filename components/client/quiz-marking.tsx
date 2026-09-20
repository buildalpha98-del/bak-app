"use client";

// The marking sheet (migration 092): students down, questions across,
// tick or cross each answer; the score fills in; save per student or
// all at once. Print the student copy and answer key from here.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { saveQuizResult, type QuizMarkingSheet, type QuizStudentRow } from "@/lib/client/quiz-actions";
import { scoreQuiz, isFullyMarked, quizBand, type QuizMarks } from "@/lib/quizzes/quiz-model";
import type { FrameworkKey } from "@/lib/curriculum/frameworks";

export function QuizMarking({
  centreId,
  sheet,
  frameworkKey,
}: {
  centreId: string;
  sheet: QuizMarkingSheet;
  /** The school's curriculum (migration 095): names the scale words. */
  frameworkKey?: FrameworkKey;
}) {
  const router = useRouter();
  const { quiz } = sheet;
  const [rows, setRows] = useState<QuizStudentRow[]>(sheet.rows);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  // Leaving mid-save would drop the rows still in flight.
  useEffect(() => {
    if (saving.size === 0 && dirty.size === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving.size, dirty.size]);

  function setMark(childId: string, qid: string, value: boolean | null) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.child.id !== childId) return r;
        const marks: QuizMarks = { ...r.marks };
        if (value === null) delete marks[qid];
        else marks[qid] = value;
        return { ...r, marks };
      })
    );
    setDirty((prev) => new Set(prev).add(childId));
  }

  async function saveRow(row: QuizStudentRow): Promise<boolean> {
    if (!isFullyMarked(quiz.questions, row.marks)) {
      toast.error(`Mark every question for ${row.child.first_name} first.`);
      return false;
    }
    setSaving((p) => new Set(p).add(row.child.id));
    const { data, error } = await saveQuizResult(centreId, quiz.id, row.child.id, row.marks);
    setSaving((p) => {
      const n = new Set(p);
      n.delete(row.child.id);
      return n;
    });
    if (error || !data) {
      toast.error(`${row.child.first_name}: ${error ?? "failed"}`);
      return false;
    }
    setRows((prev) => prev.map((r) => (r.child.id === row.child.id ? { ...r, score: data.score, marked_at: new Date().toISOString() } : r)));
    setDirty((p) => {
      const n = new Set(p);
      n.delete(row.child.id);
      return n;
    });
    return true;
  }

  function saveAll() {
    startTransition(async () => {
      // In parallel: sequential saves took ~1s each on production, and
      // leaving the page mid-way silently dropped the rest.
      const outcomes = await Promise.all(rows.filter((r) => dirty.has(r.child.id)).map((r) => saveRow(r)));
      const ok = outcomes.filter(Boolean).length;
      if (ok > 0) toast.success(`${ok} ${ok === 1 ? "student" : "students"} marked.`);
      router.refresh();
    });
  }

  const marked = rows.filter((r) => r.score !== null).length;
  const avg = marked ? Math.round(rows.filter((r) => r.score !== null).reduce((n, r) => n + (r.score! / quiz.questions.length) * 100, 0) / marked) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {quiz.questions.length} questions · {marked} of {rows.length} students marked
            {avg !== null ? ` · class average ${avg}% (${quizBand(avg, frameworkKey)})` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/client/${centreId}/quiz-pdf?quizId=${quiz.id}`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-input px-3 text-sm">
            <Printer className="h-4 w-4" /> Student copy
          </a>
          <a href={`/api/client/${centreId}/quiz-pdf?quizId=${quiz.id}&key=1`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-input px-3 text-sm">
            <Printer className="h-4 w-4" /> Answer key
          </a>
          <Button onClick={saveAll} disabled={dirty.size === 0 || saving.size > 0} className="min-h-[44px]">
            {saving.size > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            <span className="ml-1.5">Save {dirty.size > 0 ? `${dirty.size} ${dirty.size === 1 ? "student" : "students"}` : "marks"}</span>
          </Button>
        </div>
      </div>

      <details className="rounded-xl border border-portal-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">Questions and answers</summary>
        <ol className="mt-3 space-y-2 text-sm">
          {quiz.questions.map((q, i) => (
            <li key={q.id}>
              <span className="font-medium">
                Q{i + 1}. {q.prompt}
              </span>{" "}
              <span className="text-muted-foreground">
                — {q.type === "multiple_choice" ? `${String.fromCharCode(65 + Number(q.answer))}. ${q.options?.[Number(q.answer)]}` : String(q.answer)}
              </span>
            </li>
          ))}
        </ol>
      </details>

      <div className="overflow-x-auto rounded-xl border border-portal-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-portal-50 text-xs uppercase tracking-wide text-portal-800">
            <tr>
              <th className="sticky left-0 z-10 bg-portal-50 px-3 py-2 text-left font-semibold">Student</th>
              {quiz.questions.map((q, i) => (
                <th key={q.id} className="px-2 py-2 text-center font-semibold" title={q.prompt}>
                  Q{i + 1}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-semibold">Score</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const live = scoreQuiz(quiz.questions, row.marks);
              const isSaving = saving.has(row.child.id);
              const isDirty = dirty.has(row.child.id);
              const name = `${row.child.first_name} ${row.child.last_name}`;
              return (
                <tr key={row.child.id} className="border-t border-portal-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium whitespace-nowrap">
                    {name}
                    {row.child.class_name && <span className="ml-1 text-xs text-muted-foreground">{row.child.class_name}</span>}
                  </td>
                  {quiz.questions.map((q) => {
                    const v = row.marks[q.id];
                    return (
                      <td key={q.id} className="px-1 py-1.5 text-center">
                        <div className="inline-flex rounded-md border border-portal-200 overflow-hidden" role="group" aria-label={`${name} – Q${quiz.questions.indexOf(q) + 1}`}>
                          <button
                            type="button"
                            aria-pressed={v === true}
                            aria-label="Correct"
                            disabled={isSaving}
                            onClick={() => setMark(row.child.id, q.id, v === true ? null : true)}
                            className={`h-9 w-9 ${v === true ? "bg-emerald-500 text-white" : "bg-white text-muted-foreground"}`}
                          >
                            <Check className="mx-auto h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-pressed={v === false}
                            aria-label="Incorrect"
                            disabled={isSaving}
                            onClick={() => setMark(row.child.id, q.id, v === false ? null : false)}
                            className={`h-9 w-9 border-l border-portal-200 ${v === false ? "bg-red-500 text-white" : "bg-white text-muted-foreground"}`}
                          >
                            <X className="mx-auto h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {live.score} / {live.total}
                    {isFullyMarked(quiz.questions, row.marks) && (
                      <span className="ml-1 text-xs text-muted-foreground">({live.percent}%)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {isDirty ? (
                      <Button size="sm" variant="outline" className="min-h-[36px]" disabled={isSaving} onClick={() => void saveRow(row)}>
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                      </Button>
                    ) : row.score !== null ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{quizBand(Math.round((row.score / quiz.questions.length) * 100), frameworkKey)}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={quiz.questions.length + 3} className="px-3 py-8 text-center text-muted-foreground">
                  No students in your classes match the {quiz.age_band} age band.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
