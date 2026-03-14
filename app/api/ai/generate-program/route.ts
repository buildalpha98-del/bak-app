import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateProgram } from "@/lib/ai/generate-program";
import type { GenerateProgramRequest } from "@/lib/ai/types";
import { SPORTS } from "@/lib/types/enums";

// Simple in-memory rate limit: userId → last generation timestamp
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 10_000; // 10 seconds

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
    const body = (await request.json()) as GenerateProgramRequest;

    if (!body.sport || !SPORTS.includes(body.sport)) {
      return NextResponse.json(
        { error: "Invalid sport selection." },
        { status: 400 }
      );
    }
    if (!["3-5", "5-8", "8-12"].includes(body.ageGroup)) {
      return NextResponse.json(
        { error: "Invalid age group." },
        { status: 400 }
      );
    }
    if (![30, 45, 60].includes(body.durationMinutes)) {
      return NextResponse.json(
        { error: "Invalid duration." },
        { status: 400 }
      );
    }
    if (
      !body.availableEquipment ||
      !Array.isArray(body.availableEquipment) ||
      body.availableEquipment.length === 0
    ) {
      return NextResponse.json(
        { error: "Please select at least one piece of equipment." },
        { status: 400 }
      );
    }

    // 5. Generate programme via Claude
    rateLimitMap.set(user.id, Date.now());

    const programContent = await generateProgram(body);

    return NextResponse.json({ data: programContent });
  } catch (err) {
    console.error("Programme generation error:", err);

    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";

    // Differentiate error types
    if (message.includes("Failed to parse")) {
      return NextResponse.json(
        { error: "The AI returned an invalid response. Please try again." },
        { status: 422 }
      );
    }

    if (message.includes("authentication") || message.includes("api_key")) {
      return NextResponse.json(
        { error: "AI service configuration error. Please contact support." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate programme. Please try again." },
      { status: 500 }
    );
  }
}
