import { NextRequest } from "next/server";
import { DEMO_VIEWER_EMAIL } from "@/lib/demo";
import { signInDemoAccount } from "@/lib/demo-session";

// /demo/school — the shareable demo-portal link for proposals: signs the
// visitor in as the demo school's "Visiting Principal" (a non-primary
// colleague who sees everything). Mechanism and guards in
// lib/demo-session.ts.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return signInDemoAccount(request, { email: DEMO_VIEWER_EMAIL, role: "viewer", label: "/demo/school" });
}
