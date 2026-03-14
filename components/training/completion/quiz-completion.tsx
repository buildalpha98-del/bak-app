"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, AlertTriangle, Trophy } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { completeModule } from "@/lib/training/completion-actions";
import type {
  TrainingModule,
  TrainingAssignment,
  TrainingCompletion,
  QuizContent,
  QuizQuestion,
} from "@/lib/types/database";

interface Props {
  module: TrainingModule;
  assignment: TrainingAssignment | null;
  attempts: TrainingCompletion[];
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function QuizCompletion({ module, assignment, attempts }: Props) {
  const content = module.content_json as QuizContent;
  const alreadyCompleted = attempts.some((a) => a.passed);
  const previousBestAttempt = attempts[0];

  const questions = useMemo<QuizQuestion[]>(() => {
    return content.randomise_order
      ? shuffleArray(content.questions)
      : [...content.questions];
  }, [content.questions, content.randomise_order]);

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState<{ correct: number; total: number }>({
    correct: 0,
    total: 0,
  });
  const [passed, setPassed] = useState(false);
  const [completed, setCompleted] = useState(alreadyCompleted);
  const [submitting, setSubmitting] = useState(false);
  const [attemptNumber, setAttemptNumber] = useState(attempts.length + 1);
  const [pathwayInfo, setPathwayInfo] = useState<{
    pathwayComplete?: boolean;
    nextModuleId?: string;
  }>({});

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);

  const maxRetriesReached =
    !content.allow_retries ||
    (content.max_retries > 0 && attemptNumber > content.max_retries);

  const handleSubmit = useCallback(async () => {
    const correct = questions.filter(
      (q) => answers[q.id] === q.correct_answer_index
    ).length;
    const total = questions.length;
    const pct = Math.round((correct / total) * 100);
    const didPass = pct >= content.pass_mark;

    setScore({ correct, total });
    setPassed(didPass);
    setShowResults(true);

    if (didPass && assignment) {
      setSubmitting(true);
      const result = await completeModule(assignment.id, module.id, {
        score: pct,
        passed: true,
        attempt_number: attemptNumber,
        completion_data: { answers, correct, total },
      });
      if ("success" in result) {
        setCompleted(true);
        setPathwayInfo({
          pathwayComplete: result.pathwayComplete,
          nextModuleId: result.nextModuleId,
        });
      }
      setSubmitting(false);
    }
  }, [questions, answers, content.pass_mark, assignment, module.id, attemptNumber]);

  const handleRetry = useCallback(() => {
    setAnswers({});
    setShowResults(false);
    setScore({ correct: 0, total: 0 });
    setPassed(false);
    setAttemptNumber((n) => n + 1);
  }, []);

  // Already completed state showing previous score
  if (completed && !showResults) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <Trophy className="mx-auto h-12 w-12 text-amber-500" />
          <h2 className="text-xl font-semibold text-foreground">
            Quiz Completed
          </h2>
          {previousBestAttempt && previousBestAttempt.score != null && (
            <p className="text-sm text-muted-foreground">
              Your score: {previousBestAttempt.score}%
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            You have already passed this quiz.
          </p>
          {pathwayInfo.pathwayComplete && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 mt-4">
              <p className="font-semibold text-emerald-700">
                Congratulations — you&apos;ve completed the pathway!
              </p>
            </div>
          )}
          {pathwayInfo.nextModuleId && (
            <Link
              href={`/coach/training/${pathwayInfo.nextModuleId}`}
              className={cn(buttonVariants(), "mt-2")}
            >
              Continue to Next Module
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  // Results screen
  if (showResults) {
    const pct = Math.round((score.correct / score.total) * 100);

    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            {passed ? (
              <Trophy className="mx-auto h-12 w-12 text-amber-500" />
            ) : (
              <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
            )}
            <h2 className="text-xl font-semibold text-foreground">
              {score.correct}/{score.total} — {pct}%
            </h2>
            <Badge
              variant={passed ? "default" : "destructive"}
              className={
                passed
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                  : ""
              }
            >
              {passed ? "Passed" : "Failed"}
            </Badge>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {questions.map((q, idx) => {
            const selected = answers[q.id];
            const isCorrect = selected === q.correct_answer_index;

            return (
              <Card key={q.id}>
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex items-start gap-2">
                    {isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    )}
                    <p className="text-sm font-medium text-foreground">
                      {idx + 1}. {q.question}
                    </p>
                  </div>
                  {!isCorrect && (
                    <p className="text-xs text-muted-foreground ml-7">
                      Correct answer:{" "}
                      <span className="font-medium text-foreground">
                        {q.options[q.correct_answer_index]}
                      </span>
                    </p>
                  )}
                  {q.explanation && (
                    <p className="text-xs text-muted-foreground ml-7 italic">
                      {q.explanation}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {passed && pathwayInfo.pathwayComplete && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-700 text-center">
              Congratulations — you&apos;ve completed the pathway!
            </p>
          </div>
        )}

        {passed && pathwayInfo.nextModuleId && (
          <Link
            href={`/coach/training/${pathwayInfo.nextModuleId}`}
            className={cn(buttonVariants(), "w-full")}
          >
            Continue to Next Module
          </Link>
        )}

        {!passed && !maxRetriesReached && (
          <Button onClick={handleRetry} className="w-full">
            Try Again
          </Button>
        )}

        {!passed && maxRetriesReached && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <p className="text-sm font-medium text-red-700">
                No retries remaining — please contact your coordinator.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Quiz form
  return (
    <div className="space-y-4">
      {questions.map((q, idx) => (
        <Card key={q.id}>
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-sm font-medium text-foreground">
              {idx + 1}. {q.question}
            </p>
            <RadioGroup
              value={answers[q.id]?.toString()}
              onValueChange={(val) =>
                setAnswers((prev) => ({ ...prev, [q.id]: parseInt(val, 10) }))
              }
            >
              {q.options.map((option, optIdx) => (
                <div key={optIdx} className="flex items-center gap-2">
                  <RadioGroupItem
                    value={optIdx.toString()}
                    id={`${q.id}-${optIdx}`}
                  />
                  <Label
                    htmlFor={`${q.id}-${optIdx}`}
                    className="text-sm font-normal"
                  >
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      ))}

      <Button
        onClick={handleSubmit}
        disabled={!allAnswered || submitting || !assignment}
        className="w-full"
      >
        {submitting ? "Submitting..." : "Submit Quiz"}
      </Button>
    </div>
  );
}
