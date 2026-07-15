import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { insightGenerateSchema } from "@/lib/validation/schemas";
import { requireAuth, requireRateLimit } from "@/lib/utils/apiProtection";
import { captureError } from "@/lib/utils/errorTracking";
import { AI_MODEL } from "@/lib/ai/model";

export const dynamic = "force-dynamic";

// ============================================================
// AI Child Development Insight Generator
// ============================================================

function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Please add it to your environment variables."
    );
  }
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

const SYSTEM_PROMPT = `You are a child development specialist for Build Alpha Kids, an Australian children's multi-sport program. Generate a developmental insight report for a child based on their participation data. Write in Australian English. Be encouraging and constructive. Focus on observable development patterns.

Generate JSON with no markdown or code fences:
{
  "summary": "2-3 sentences overview of the child's development and participation",
  "strengths": ["3-5 key strengths observed from participation and skill data"],
  "areas_for_growth": ["2-3 areas for improvement, framed positively"],
  "recommendations": ["3-4 specific, actionable recommendations for parents and coaches"],
  "sport_highlights": [{"sport": "Sport Name", "observation": "Specific observation about performance or development in this sport"}]
}`;

interface InsightContent {
  summary: string;
  strengths: string[];
  areas_for_growth: string[];
  recommendations: string[];
  sport_highlights: { sport: string; observation: string }[];
}

function parseInsightResponse(text: string): InsightContent {
  // Try direct JSON parse
  try {
    return JSON.parse(text) as InsightContent;
  } catch {
    // Fallback: extract from code fences
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]) as InsightContent;
      } catch {
        // Fall through
      }
    }

    // Last resort: find first { and last }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as InsightContent;
      } catch {
        // Fall through
      }
    }
  }

  throw new Error("Failed to parse AI response as JSON");
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { user, error: authError } = await requireAuth(request);
    if (authError) return authError;

    // Rate limit: 20 insight generations per minute per user
    const rateLimitError = requireRateLimit(request, `insights:${user!.id}`, 20);
    if (rateLimitError) return rateLimitError;

    const body = await request.json();

    // Validate request body
    const parsed = insightGenerateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { childId, termId, centreId } = parsed.data;

    const admin = createSupabaseAdmin();

    // 1. Fetch child data
    const { data: child, error: childError } = await admin
      .from("children")
      .select("id, first_name, last_name, date_of_birth, age_group, gender, medical_notes, status")
      .eq("id", childId)
      .single();

    if (childError || !child) {
      return NextResponse.json(
        { error: "Child not found" },
        { status: 404 }
      );
    }

    // 2. Fetch skill ratings
    let skillRatingsQuery = admin
      .from("skill_ratings")
      .select("id, child_id, template_id, term_id, centre_id, ratings, coach_id, rated_at, created_at")
      .eq("child_id", childId)
      .order("rated_at", { ascending: false });

    if (termId) {
      skillRatingsQuery = skillRatingsQuery.eq("term_id", termId);
    }

    const { data: skillRatings } = await skillRatingsQuery;

    // 3. Fetch session attendances with session details
    const { data: attendances } = await admin
      .from("session_attendances")
      .select("id, session_id, child_id, present, created_at, session:sessions!session_id(id, centre_id, date, sport, status)")
      .eq("child_id", childId)
      .order("created_at", { ascending: false })
      .limit(100);

    // 4. Build sports participation summary
    const sportsMap = new Map<string, { attended: number; total: number }>();
    if (attendances) {
      for (const att of attendances) {
        const session = att.session as unknown as {
          id: string;
          centre_id: string;
          date: string;
          sport: string;
          status: string;
        } | null;
        if (!session?.sport) continue;

        const existing = sportsMap.get(session.sport) || {
          attended: 0,
          total: 0,
        };
        existing.total += 1;
        if (att.present) existing.attended += 1;
        sportsMap.set(session.sport, existing);
      }
    }

    const sportsParticipation = Array.from(sportsMap.entries()).map(
      ([sport, counts]) => ({
        sport,
        sessions_attended: counts.attended,
        sessions_total: counts.total,
        attendance_rate: counts.total > 0
          ? Math.round((counts.attended / counts.total) * 100)
          : 0,
      })
    );

    // 5. Fetch term info if provided
    let termInfo = null;
    if (termId) {
      const { data: term } = await admin
        .from("terms")
        .select("id, name, start_date, end_date, status")
        .eq("id", termId)
        .single();
      termInfo = term;
    }

    // 6. Build context for Claude
    const childAge = child.date_of_birth
      ? Math.floor(
          (Date.now() - new Date(child.date_of_birth).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : null;

    const contextMessage = `Generate a developmental insight report for this child:

Child: ${child.first_name} ${child.last_name}
Age group: ${child.age_group}${childAge !== null ? ` (approximately ${childAge} years old)` : ""}
${termInfo ? `Term: ${termInfo.name} (${termInfo.start_date} to ${termInfo.end_date})` : ""}

Sports participation:
${
  sportsParticipation.length > 0
    ? sportsParticipation
        .map(
          (s) =>
            `- ${s.sport}: ${s.sessions_attended}/${s.sessions_total} sessions attended (${s.attendance_rate}% attendance)`
        )
        .join("\n")
    : "No attendance records available"
}

Skill ratings data:
${
  skillRatings && skillRatings.length > 0
    ? skillRatings
        .map(
          (sr) =>
            `- Rated at: ${sr.rated_at}, Ratings: ${JSON.stringify(sr.ratings)}`
        )
        .join("\n")
    : "No skill ratings available yet"
}

Total sessions recorded: ${attendances?.length ?? 0}
Sessions attended: ${attendances?.filter((a) => a.present).length ?? 0}`;

    // 7. Call Claude API
    const anthropic = getAnthropicClient();
    const message = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: contextMessage }],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    const insight = parseInsightResponse(responseText);

    // 8. Determine insight type
    const insightType = termId ? "term_end" : "on_demand";

    // 9. Save to database
    const { data: savedInsight, error: saveError } = await admin
      .from("child_insights")
      .insert({
        child_id: childId,
        term_id: termId || null,
        centre_id: centreId || null,
        insight_type: insightType,
        content_json: insight,
        summary: insight.summary,
        strengths: insight.strengths,
        areas_for_growth: insight.areas_for_growth,
        recommendations: insight.recommendations,
        generated_by: "ai",
      })
      .select()
      .single();

    if (saveError) {
      captureError(saveError, { action: "insight_save" });
      return NextResponse.json(
        { error: "Failed to save insight. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: savedInsight });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error("Insight generation error:", errorMessage);
    if (errorStack) {
      console.error("Stack trace:", errorStack);
    }
    captureError(err, { action: "insight_generation" });

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

    if (errorMessage.includes("Failed to parse")) {
      return NextResponse.json(
        { error: "The AI returned an invalid response. Please try again." },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate insight. Please try again." },
      { status: 500 }
    );
  }
}
