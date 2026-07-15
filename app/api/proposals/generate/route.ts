import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getProposalContext,
  saveProposal,
  type ProposalContentJson,
} from "@/lib/proposals/actions";
import { proposalGenerateSchema } from "@/lib/validation/schemas";
import { requireRateLimit } from "@/lib/utils/apiProtection";
import { captureError } from "@/lib/utils/errorTracking";
import { AI_MODEL } from "@/lib/ai/model";

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    // Rate limit: 10 proposal generations per minute per user
    const rateLimitError = requireRateLimit(req, `proposals:${user.id}`, 10);
    if (rateLimitError) return rateLimitError;

    const body = await req.json();

    // Validate request body
    const parsed = proposalGenerateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { leadId, templateId } = parsed.data;

    // If using a template, fetch its content as a base
    let templateContent: ProposalContentJson | null = null;
    if (templateId) {
      const { data: templateProposal } = await supabase
        .from("sales_proposals")
        .select("content_json")
        .eq("id", templateId)
        .single();

      if (templateProposal) {
        templateContent =
          templateProposal.content_json as unknown as ProposalContentJson;
      }
    }

    // Assemble context
    const { data: context, error: contextError } =
      await getProposalContext(leadId);

    if (contextError || !context) {
      return NextResponse.json(
        { error: contextError ?? "Failed to build proposal context" },
        { status: 400 }
      );
    }

    // Build Claude prompt
    const contextSummary = `
LEAD DETAILS:
- Centre name: ${context.lead.centre_name}
- Contact: ${context.lead.contact_name ?? "Not specified"}
- Centre type: ${context.lead.type ?? "Not specified"}
- Location: ${context.lead.address ?? "Not specified"}
- Estimated value: ${context.lead.estimated_value ? `$${context.lead.estimated_value}` : "Not specified"}
- Notes: ${context.lead.notes ?? "None"}

BUSINESS STATS:
- Active centres: ${context.businessStats.totalCentres}
- Completed sessions: ${context.businessStats.totalSessions}
- Average feedback rating: ${context.businessStats.averageRating}/5
- Sports offered: ${context.businessStats.sportsOffered.join(", ") || "Multi-Sport programs"}

NEARBY CENTRES (for social proof):
${
  context.nearbyCentres.length > 0
    ? context.nearbyCentres
        .map(
          (c) =>
            `- ${c.name} (${c.suburb ?? "Unknown suburb"}): ${c.sessionCount} sessions, ${c.avgRating ? `${c.avgRating}/5 rating` : "no ratings yet"}`
        )
        .join("\n")
    : "- No nearby centres yet (new area expansion)"
}

${
  context.trialData
    ? `TRIAL DATA:
- Sessions completed: ${context.trialData.sessions.length}
- Sports covered: ${[...new Set(context.trialData.sessions.map((s) => s.sport))].join(", ")}
- Average feedback: ${context.trialData.feedbackAvg ?? "No feedback yet"}/5 (${context.trialData.feedbackCount} responses)`
    : "TRIAL DATA: No trial has been conducted yet."
}
`;

    const templateInstruction = templateContent
      ? `\nUse this template as a structural guide, but personalise the content for this specific lead:\n${JSON.stringify(templateContent, null, 2)}`
      : "";

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Please add it to your environment variables."
      );
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      system:
        "You are a sales proposal writer for Build Alpha Kids, an Australian children's multi-sport program provider. Generate a professional, persuasive proposal for a prospective centre. Write in Australian English. Be warm but professional. Use data to demonstrate value. The proposal should feel personalised, not templated. Generate the following sections as JSON: { executive_summary, about_bak, service_offering, local_impact, trial_results (or null), pricing: { model, rate, details }, next_steps, testimonial_quotes: string[] }",
      messages: [
        {
          role: "user",
          content: `Generate a sales proposal for the following prospective centre. Return ONLY valid JSON with the specified sections, no markdown formatting or code blocks.${templateInstruction}\n\n${contextSummary}`,
        },
      ],
    });

    // Parse Claude response
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    let proposalContent: ProposalContentJson;
    try {
      // Strip any markdown code block markers if present
      const cleaned = responseText
        .replace(/^```json?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      proposalContent = JSON.parse(cleaned) as ProposalContentJson;
    } catch {
      return NextResponse.json(
        {
          error: "Failed to parse AI response. Please try again.",
          raw: responseText,
        },
        { status: 500 }
      );
    }

    // Save the proposal
    const title = `Proposal for ${context.lead.centre_name}`;
    const { data: savedProposal, error: saveError } = await saveProposal(
      leadId,
      title,
      proposalContent,
      user.id
    );

    if (saveError || !savedProposal) {
      return NextResponse.json(
        { error: saveError ?? "Failed to save proposal" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: savedProposal });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error("Proposal generation error:", errorMessage);
    if (errorStack) {
      console.error("Stack trace:", errorStack);
    }
    captureError(err, { action: "proposal_generation" });

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

    return NextResponse.json(
      { error: "Failed to generate proposal. Please try again." },
      { status: 500 }
    );
  }
}
