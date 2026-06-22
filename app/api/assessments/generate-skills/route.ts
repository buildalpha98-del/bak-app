import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateSkills } from "@/lib/ai/generate-skills";
import { SPORTS } from "@/lib/types/enums";
import {
  checkDailyLimit,
  getCached,
  setCached,
  hashRequestKey,
} from "@/lib/ai/cache-and-limit";

// Per-user 10s cooldown — prevents accidental double-clicks.
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 10_000;

// Per-user daily cap on AI generations. Belt-and-braces against a
// runaway tab. 30/day × ~$0.50/call = $15/day ceiling per user.
const DAILY_LIMIT = 30;

export async function POST(request: Request) {
  try {
    // 1. Auth
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    // 2. Role check (admin or ops only)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return NextResponse.json(
        { error: "Insufficient permissions." },
        { status: 403 }
      );
    }

    // 3. Rate limiting
    const lastGen = rateLimitMap.get(user.id);
    if (lastGen && Date.now() - lastGen < RATE_LIMIT_MS) {
      const waitSeconds = Math.ceil(
        (RATE_LIMIT_MS - (Date.now() - lastGen)) / 1000
      );
      return NextResponse.json(
        { error: `Please wait ${waitSeconds} seconds before generating again.` },
        { status: 429 }
      );
    }

    // 4. Parse and validate body
    const body = await request.json();
    const { sport, ageGroup } = body as { sport: string; ageGroup: string };

    if (!sport || !SPORTS.includes(sport as typeof SPORTS[number])) {
      return NextResponse.json(
        { error: "Invalid sport selection." },
        { status: 400 }
      );
    }
    if (!["3-5", "5-8", "8-12"].includes(ageGroup)) {
      return NextResponse.json(
        { error: "Invalid age group." },
        { status: 400 }
      );
    }

    // 5. Check for existing template
    const { data: existing } = await supabase
      .from("assessment_templates")
      .select("id, skills_json, created_at")
      .eq("sport", sport)
      .eq("age_group", ageGroup)
      .order("created_at", { ascending: false })
      .limit(1);

    // 6. Result cache — same (sport, ageGroup) returns the previous
    // Claude output for 24h. Lets a user reopen the dialog without
    // re-spending the AI tokens. Cache key is global (not per-user)
    // because the output doesn't depend on who's asking.
    const cacheKey = hashRequestKey("skills", { sport, ageGroup });
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json({
        data: cached,
        existing: existing && existing.length > 0 ? existing[0] : null,
        cached: true,
      });
    }

    // 7. Daily cap — only counts uncached generations against the user.
    const daily = checkDailyLimit(`skills:${user.id}`, DAILY_LIMIT);
    if (!daily.allowed) {
      const hoursToReset = Math.ceil((daily.resetAt - Date.now()) / 3_600_000);
      return NextResponse.json(
        {
          error: `Daily generation limit reached (${DAILY_LIMIT}/day). Resets in ~${hoursToReset}h.`,
        },
        { status: 429 }
      );
    }

    // 8. Generate skills via Claude
    rateLimitMap.set(user.id, Date.now());
    const skills = await generateSkills(sport, ageGroup);
    setCached(cacheKey, skills);

    return NextResponse.json({
      data: skills,
      existing: existing && existing.length > 0 ? existing[0] : null,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error("Skill generation error:", errorMessage);
    if (errorStack) {
      console.error("Stack trace:", errorStack);
    }

    if (errorMessage.includes("ANTHROPIC_API_KEY")) {
      return NextResponse.json(
        { error: "AI service is not configured. Please contact support." },
        { status: 503 }
      );
    }

    if (
      errorMessage.includes("authentication") ||
      errorMessage.includes("api_key") ||
      errorMessage.includes("invalid x-api-key")
    ) {
      return NextResponse.json(
        { error: "AI service authentication failed. Please contact support." },
        { status: 502 }
      );
    }

    if (errorMessage.includes("rate_limit") || errorMessage.includes("429")) {
      return NextResponse.json(
        { error: "AI service is temporarily busy. Please try again in a minute." },
        { status: 429 }
      );
    }

    if (
      errorMessage.includes("overloaded") ||
      errorMessage.includes("529") ||
      errorMessage.includes("503")
    ) {
      return NextResponse.json(
        { error: "AI service is temporarily unavailable. Please try again shortly." },
        { status: 503 }
      );
    }

    if (errorMessage.includes("Failed to parse")) {
      return NextResponse.json(
        { error: "The AI returned an invalid response. Please try again." },
        { status: 422 }
      );
    }

    if (
      errorMessage.includes("fetch failed") ||
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("network")
    ) {
      return NextResponse.json(
        { error: "Could not connect to AI service. Please check your network and try again." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate skills. Please try again." },
      { status: 500 }
    );
  }
}
