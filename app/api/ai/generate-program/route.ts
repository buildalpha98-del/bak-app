import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateProgram } from "@/lib/ai/generate-program";
import { validateAgeBands } from "@/lib/utils/programs/age-bands";
import {
  checkDailyLimit,
  getCached,
  setCached,
  hashRequestKey,
} from "@/lib/ai/cache-and-limit";

// Per-user 10s cooldown — prevents accidental double-clicks.
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 10_000;

// Per-user daily cap. 30/day × ~$1/call ≈ $30/day ceiling per user.
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
    const body = (await request.json()) as Record<string, unknown>;

    // Sport: accept any non-empty string up to 64 chars (custom sports supported)
    const sport = typeof body.sport === "string" ? body.sport.trim() : "";
    if (sport.length === 0 || sport.length > 64) {
      return NextResponse.json(
        { error: "Sport is required." },
        { status: 400 }
      );
    }

    // Age bands: validate array using AgeBand helper
    const ageGroups = Array.isArray(body.ageGroups) ? (body.ageGroups as string[]) : [];
    const ageValidation = validateAgeBands(ageGroups);
    if (!ageValidation.ok) {
      return NextResponse.json(
        { error: ageValidation.message },
        { status: 400 }
      );
    }

    if (![30, 45, 60].includes(body.durationMinutes as number)) {
      return NextResponse.json(
        { error: "Invalid duration." },
        { status: 400 }
      );
    }
    // Validate availableEquipment shape
    const availableEquipment = Array.isArray(body.availableEquipment)
      ? body.availableEquipment.filter((s: unknown): s is string => typeof s === "string" && s.length > 0)
      : [];
    if (availableEquipment.length === 0) {
      return NextResponse.json(
        { error: "Please select at least one piece of equipment." },
        { status: 400 }
      );
    }

    // Validate centreContext shape (optional)
    let centreContext: {
      centreName: string;
      recentPrograms: Array<{ title: string; sport: string; skillFocus: string | null }>;
    } | undefined;
    if (body.centreContext != null) {
      const cc = body.centreContext as Record<string, unknown>;
      if (
        typeof cc !== "object" ||
        typeof cc.centreName !== "string" ||
        !Array.isArray(cc.recentPrograms)
      ) {
        return NextResponse.json({ error: "Invalid centreContext shape." }, { status: 400 });
      }
      centreContext = {
        centreName: cc.centreName as string,
        recentPrograms: (cc.recentPrograms as unknown[])
          .filter(
            (p: unknown): p is { title: string; sport: string; skillFocus: string | null } =>
              typeof p === "object" &&
              p !== null &&
              typeof (p as { title?: unknown }).title === "string" &&
              typeof (p as { sport?: unknown }).sport === "string" &&
              ((p as { skillFocus?: unknown }).skillFocus === null ||
                typeof (p as { skillFocus?: unknown }).skillFocus === "string")
          )
      };
    }

    // 5. Result cache — same (sport, ageGroups, duration, skillFocus,
    // equipment) returns the previous Claude output for 24h.
    // centreContext is intentionally excluded from the key — recent
    // programs at a centre change over time and we want fresh output
    // when context shifts. Cache is global (not per-user).
    const cacheParams = {
      sport,
      ageGroups: [...ageGroups].sort(),
      durationMinutes: body.durationMinutes,
      skillFocus: typeof body.skillFocus === "string" ? body.skillFocus : null,
      availableEquipment: [...availableEquipment].sort(),
    };
    const cacheKey = hashRequestKey("program", cacheParams);
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json({ data: cached, cached: true });
    }

    // 6. Daily cap — only counts uncached generations against the user.
    const daily = checkDailyLimit(`program:${user.id}`, DAILY_LIMIT);
    if (!daily.allowed) {
      const hoursToReset = Math.ceil((daily.resetAt - Date.now()) / 3_600_000);
      return NextResponse.json(
        {
          error: `Daily generation limit reached (${DAILY_LIMIT}/day). Resets in ~${hoursToReset}h.`,
        },
        { status: 429 }
      );
    }

    // 7. Generate programme via Claude
    rateLimitMap.set(user.id, Date.now());

    const programContent = await generateProgram({
      sport,
      ageGroups,
      durationMinutes: body.durationMinutes as number,
      skillFocus: typeof body.skillFocus === "string" ? body.skillFocus : undefined,
      availableEquipment,
      centreContext,
    });
    setCached(cacheKey, programContent);

    return NextResponse.json({ data: programContent });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error("Programme generation error:", errorMessage);
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
      { error: "Failed to generate programme. Please try again." },
      { status: 500 }
    );
  }
}
