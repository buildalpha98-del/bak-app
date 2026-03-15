import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit } from "./rateLimit";

export async function requireAuth(req: NextRequest): Promise<{
  user: { id: string; email: string } | null;
  error: NextResponse | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorised" }, { status: 401 }),
    };
  }

  return { user: { id: user.id, email: user.email ?? "" }, error: null };
}

export function requireRateLimit(
  req: NextRequest,
  identifier: string,
  limit?: number
): NextResponse | null {
  const result = rateLimit(identifier, limit);
  if (!result.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(result.remaining),
          "X-RateLimit-Reset": String(result.resetAt),
        },
      }
    );
  }
  return null;
}

export function requireCronAuth(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return null;
}
