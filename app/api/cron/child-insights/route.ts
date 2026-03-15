import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ============================================================
// Cron: Auto-generate child insights at term end
// ============================================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a child development specialist for Build Alpha Kids, an Australian children's multi-sport program. Generate a developmental insight report for a child based on their participation data. Write in Australian English. Be encouraging and constructive. Focus on observable development patterns.

Generate JSON with no markdown or code fences:
{
  "summary": "2-3 sentences overview of the child's development and participation",
  "strengths": ["3-5 key strengths observed from participation and skill data"],
  "areas_for_growth": ["2-3 areas for improvement, framed positively"],
  "recommendations": ["3-4 specific, actionable recommendations for parents and coaches"],
  "sport_highlights": [{"sport": "Sport Name", "observation": "Specific observation about performance or development in this sport"}]
}`;

const MAX_PER_RUN = 50;

interface InsightContent {
  summary: string;
  strengths: string[];
  areas_for_growth: string[];
  recommendations: string[];
  sport_highlights: { sport: string; observation: string }[];
}

function parseInsightResponse(text: string): InsightContent {
  try {
    return JSON.parse(text) as InsightContent;
  } catch {
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]) as InsightContent;
      } catch {
        // Fall through
      }
    }
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

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();

  // 1. Find the most recently completed term
  const { data: completedTerm, error: termError } = await admin
    .from("terms")
    .select("id, name, start_date, end_date, status")
    .eq("status", "completed")
    .order("end_date", { ascending: false })
    .limit(1)
    .single();

  if (termError || !completedTerm) {
    return NextResponse.json({
      message: "No completed term found",
      count: 0,
    });
  }

  // 2. Get all children who have skill ratings for this term
  const { data: ratedChildren } = await admin
    .from("skill_ratings")
    .select("child_id")
    .eq("term_id", completedTerm.id);

  if (!ratedChildren || ratedChildren.length === 0) {
    return NextResponse.json({
      message: "No children with skill ratings for the completed term",
      term: completedTerm.name,
      count: 0,
    });
  }

  // Unique child IDs
  const childIds = [...new Set(ratedChildren.map((r) => r.child_id))];

  // 3. Check which children already have a term_end insight for this term
  const { data: existingInsights } = await admin
    .from("child_insights")
    .select("child_id")
    .eq("term_id", completedTerm.id)
    .eq("insight_type", "term_end");

  const alreadyGenerated = new Set(
    (existingInsights ?? []).map((i) => i.child_id)
  );

  const pendingChildIds = childIds
    .filter((id) => !alreadyGenerated.has(id))
    .slice(0, MAX_PER_RUN);

  if (pendingChildIds.length === 0) {
    return NextResponse.json({
      message: "All children already have insights for this term",
      term: completedTerm.name,
      count: 0,
    });
  }

  // 4. Generate insights for each child
  let generated = 0;
  const errors: string[] = [];

  for (const childId of pendingChildIds) {
    try {
      // Fetch child
      const { data: child } = await admin
        .from("children")
        .select("id, first_name, last_name, date_of_birth, age_group")
        .eq("id", childId)
        .single();

      if (!child) continue;

      // Fetch skill ratings for this term
      const { data: skillRatings } = await admin
        .from("skill_ratings")
        .select("ratings, rated_at, centre_id")
        .eq("child_id", childId)
        .eq("term_id", completedTerm.id);

      // Fetch attendances during the term period
      const { data: attendances } = await admin
        .from("session_attendances")
        .select(
          "present, session:sessions!session_id(sport, date, centre_id)"
        )
        .eq("child_id", childId);

      // Filter attendances within term dates
      const termAttendances = (attendances ?? []).filter((a) => {
        const session = a.session as unknown as {
          sport: string;
          date: string;
          centre_id: string;
        } | null;
        if (!session?.date) return false;
        return (
          session.date >= completedTerm.start_date &&
          session.date <= completedTerm.end_date
        );
      });

      // Build sports summary
      const sportsMap = new Map<string, { attended: number; total: number }>();
      for (const att of termAttendances) {
        const session = att.session as unknown as {
          sport: string;
          date: string;
          centre_id: string;
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

      const sportsParticipation = Array.from(sportsMap.entries()).map(
        ([sport, counts]) => ({
          sport,
          sessions_attended: counts.attended,
          sessions_total: counts.total,
          attendance_rate:
            counts.total > 0
              ? Math.round((counts.attended / counts.total) * 100)
              : 0,
        })
      );

      const childAge = child.date_of_birth
        ? Math.floor(
            (Date.now() - new Date(child.date_of_birth).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000)
          )
        : null;

      // Determine centre_id from the first skill rating
      const centreId = skillRatings?.[0]?.centre_id ?? null;

      const contextMessage = `Generate a developmental insight report for this child:

Child: ${child.first_name} ${child.last_name}
Age group: ${child.age_group}${childAge !== null ? ` (approximately ${childAge} years old)` : ""}
Term: ${completedTerm.name} (${completedTerm.start_date} to ${completedTerm.end_date})

Sports participation this term:
${
  sportsParticipation.length > 0
    ? sportsParticipation
        .map(
          (s) =>
            `- ${s.sport}: ${s.sessions_attended}/${s.sessions_total} sessions (${s.attendance_rate}% attendance)`
        )
        .join("\n")
    : "No attendance records for this term"
}

Skill ratings:
${
  skillRatings && skillRatings.length > 0
    ? skillRatings
        .map(
          (sr) =>
            `- Rated at: ${sr.rated_at}, Ratings: ${JSON.stringify(sr.ratings)}`
        )
        .join("\n")
    : "No skill ratings available"
}

Total sessions this term: ${termAttendances.length}
Sessions attended: ${termAttendances.filter((a) => a.present).length}`;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        temperature: 0.7,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: contextMessage }],
      });

      const responseText =
        message.content[0].type === "text" ? message.content[0].text : "";

      const insight = parseInsightResponse(responseText);

      await admin.from("child_insights").insert({
        child_id: childId,
        term_id: completedTerm.id,
        centre_id: centreId,
        insight_type: "term_end",
        content_json: insight,
        summary: insight.summary,
        strengths: insight.strengths,
        areas_for_growth: insight.areas_for_growth,
        recommendations: insight.recommendations,
        generated_by: "ai_cron",
      });

      generated++;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error";
      errors.push(`Child ${childId}: ${errorMsg}`);
      console.error(`Failed to generate insight for child ${childId}:`, err);
    }
  }

  return NextResponse.json({
    message: `Generated ${generated} child insights for ${completedTerm.name}`,
    term: completedTerm.name,
    count: generated,
    remaining: pendingChildIds.length - generated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
