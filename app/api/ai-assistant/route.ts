import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCoachUsageToday,
  getConversationHistory,
  saveConversationMessage,
  recordUsage,
  getCachedResponse,
  setCachedResponse,
} from "@/lib/ai/assistant-actions";
import { assembleSessionContext } from "@/lib/ai/context-assembly";
import type { SessionContextData } from "@/lib/ai/context-assembly";
import { AI_MODEL } from "@/lib/ai/model";

// ============================================================
// AI Coach Assistant — API Route
// ============================================================

const DAILY_LIMIT = 20;

const SYSTEM_PROMPT = `You are an AI coaching assistant for Build Alpha Kids, a multi-sport coaching business. Help coaches with session planning, activity ideas, behaviour management, and adaptation strategies. Keep responses practical, concise, and actionable. Use Australian English.`;

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

function generateCacheKey(message: string, context: string): string {
  // Simple hash: combine message + context into a deterministic key
  const raw = `${message.trim().toLowerCase()}::${context}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `ai_assistant_${hash}`;
}

export async function POST(request: Request) {
  try {
    // 1. Auth check
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

    // 2. Parse body
    const body = (await request.json()) as {
      conversationId: string;
      message: string;
      sessionContext: SessionContextData;
    };

    const { conversationId, message, sessionContext } = body;

    if (!conversationId || !message?.trim()) {
      return NextResponse.json(
        { error: "Missing conversationId or message." },
        { status: 400 }
      );
    }

    // 3. Rate limit check
    const { count: usageCount } = await getCoachUsageToday(user.id);
    if (usageCount >= DAILY_LIMIT) {
      return NextResponse.json(
        {
          error:
            "You've reached today's limit of 20 AI assistant requests. Try again tomorrow.",
        },
        { status: 429 }
      );
    }

    // 4. Build context string
    const contextString = sessionContext
      ? assembleSessionContext(sessionContext)
      : "";

    // 5. Cache check
    const cacheKey = generateCacheKey(message, contextString);
    const { data: cachedResponse } = await getCachedResponse(cacheKey);

    if (cachedResponse) {
      // Save messages and return cached
      await saveConversationMessage(conversationId, "user", message);
      await saveConversationMessage(conversationId, "assistant", cachedResponse);
      await recordUsage(user.id, conversationId, 0);

      return NextResponse.json({
        response: cachedResponse,
        tokensUsed: 0,
        cached: true,
      });
    }

    // 6. Get conversation history
    const { data: history } = await getConversationHistory(conversationId);
    const previousMessages: Array<{
      role: "user" | "assistant";
      content: string;
    }> = (history ?? []).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // 7. Build full system prompt with context
    const fullSystemPrompt = contextString
      ? `${SYSTEM_PROMPT}\n\n${contextString}`
      : SYSTEM_PROMPT;

    // 8. Call Claude API
    const claudeMessages = [
      ...previousMessages,
      { role: "user" as const, content: message },
    ];

    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      temperature: 0.7,
      system: fullSystemPrompt,
      messages: claudeMessages,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No response received from AI." },
        { status: 502 }
      );
    }

    const assistantResponse = textBlock.text;
    const tokensUsed =
      (response.usage?.input_tokens ?? 0) +
      (response.usage?.output_tokens ?? 0);

    // 9. Save messages to conversation
    await saveConversationMessage(conversationId, "user", message);
    await saveConversationMessage(
      conversationId,
      "assistant",
      assistantResponse
    );

    // 10. Record usage
    await recordUsage(user.id, conversationId, tokensUsed);

    // 11. Cache response
    await setCachedResponse(cacheKey, message, assistantResponse, tokensUsed);

    return NextResponse.json({
      response: assistantResponse,
      tokensUsed,
      cached: false,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error("AI Assistant error:", errorMessage);
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

    return NextResponse.json(
      { error: "Failed to get AI response. Please try again." },
      { status: 500 }
    );
  }
}
