"use client";

// "Create a quiz for this lesson" (migration 092): generate, read the
// questions and answers, save. Marking happens on the quiz page.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ListChecks, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { saveQuiz } from "@/lib/client/quiz-actions";
import type { QuizQuestion } from "@/lib/quizzes/quiz-model";

interface GeneratedQuiz {
  title: string;
  questions: QuizQuestion[];
  subject: string;
  focus: string;
  ageBand: string;
  programId: string | null;
}

export function QuizBuilder({
  centreId,
  programId,
  lessonTitle,
}: {
  centreId: string;
  programId: string;
  lessonTitle: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "generating" | "preview" | "saving">("idle");
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setStatus("generating");
    setError(null);
    try {
      const res = await fetch(`/api/client/${centreId}/generate-quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate the quiz.");
      setQuiz(json.data as GeneratedQuiz);
      setStatus("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate the quiz.");
      setStatus("idle");
    }
  }

  async function save() {
    if (!quiz) return;
    setStatus("saving");
    const { data, error: saveError } = await saveQuiz(centreId, {
      programId,
      subject: quiz.subject,
      focus: quiz.focus,
      ageBand: quiz.ageBand,
      title: quiz.title,
      questions: quiz.questions,
    });
    if (saveError || !data) {
      toast.error(saveError ?? "Failed to save the quiz.");
      setStatus("preview");
      return;
    }
    toast.success("Quiz saved — mark it from the quiz page.");
    router.push(`/client/${centreId}/quizzes/${data.id}`);
  }

  if (status === "idle" || status === "generating") {
    return (
      <div className="rounded-xl border border-portal-200 bg-portal-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ListChecks className="h-5 w-5 text-portal-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">Knowledge check</p>
              <p className="text-sm text-muted-foreground">
                Eight questions on what &ldquo;{lessonTitle}&rdquo; taught — six multiple choice, two short
                answer — with a printable student copy, an answer key and a marking sheet.
              </p>
              {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
            </div>
          </div>
          <Button onClick={generate} disabled={status === "generating"} className="min-h-[44px]">
            {status === "generating" ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Writing questions…
              </>
            ) : (
              "Create a quiz for this lesson"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-portal-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-portal-800">Quiz preview</p>
          <h2 className="text-lg font-semibold text-foreground">{quiz?.title}</h2>
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={status === "saving"} className="min-h-[44px]">
            {status === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save quiz
          </Button>
          <Button variant="outline" onClick={generate} className="min-h-[44px]">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Regenerate
          </Button>
        </div>
      </div>
      <ol className="space-y-3">
        {quiz?.questions.map((q, i) => (
          <li key={q.id} className="rounded-lg border border-portal-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground">
                {i + 1}. {q.prompt}
              </p>
              {q.skill && <Badge variant="outline" className="shrink-0 text-[11px]">{q.skill}</Badge>}
            </div>
            {q.type === "multiple_choice" ? (
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {q.options?.map((o, oi) => (
                  <li
                    key={oi}
                    className={`rounded-md border px-2 py-1 text-sm ${
                      oi === q.answer ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-input"
                    }`}
                  >
                    {String.fromCharCode(65 + oi)}. {o}
                    {oi === q.answer ? " ✓" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Model answer: <span className="text-foreground">{String(q.answer)}</span>
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
