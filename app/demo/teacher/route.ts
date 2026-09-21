import { NextRequest } from "next/server";
import { DEMO_TEACHER_EMAIL } from "@/lib/demo";
import { signInDemoAccount } from "@/lib/demo-session";

// /demo/teacher — the shareable link to show a class teacher: signs the
// visitor in as the demo school's class teacher for one class, so they
// see exactly what a teacher sees — their class's dashboard, term plan,
// lesson generator, assessments grid, quizzes and report cards — and
// nothing else. Mechanism and guards in lib/demo-session.ts.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return signInDemoAccount(request, { email: DEMO_TEACHER_EMAIL, role: "teacher", label: "/demo/teacher" });
}
