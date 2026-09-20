import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuizPdf } from "@/lib/quizzes/quiz-pdf";
import { normaliseQuestions } from "@/lib/quizzes/quiz-model";
import { subjectOf } from "@/lib/curriculum/subjects";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";

// Student copy (default) or answer key (?key=1) of a school's quiz,
// read through the cookie client so RLS decides.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ centreId: string }> }
) {
  const { centreId } = await params;
  const url = new URL(request.url);
  const quizId = url.searchParams.get("quizId");
  const answerKey = url.searchParams.get("key") === "1";
  if (!quizId) return NextResponse.json({ error: "quizId is required" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const [{ data: quiz }, { data: centre }] = await Promise.all([
    supabase
      .from("quizzes")
      .select("id, subject, focus, age_band, title, questions_json")
      .eq("id", quizId)
      .eq("centre_id", centreId)
      .maybeSingle(),
    supabase.from("centres").select("name").eq("id", centreId).maybeSingle(),
  ]);
  if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  const generatedOn = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: SYDNEY_TZ,
  }).format(new Date());

  const element = React.createElement(QuizPdf, {
    title: quiz.title,
    subjectLabel: subjectOf(quiz.subject).label,
    focus: quiz.focus,
    ageBand: quiz.age_band,
    schoolName: centre?.name ?? "Your school",
    questions: normaliseQuestions(quiz.questions_json, 10),
    answerKey,
    generatedOn,
  }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(element);
  const safe = quiz.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safe || "quiz"}${answerKey ? "-answer-key" : ""}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
