"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AiAssistantConversation } from "@/lib/types/database";

// ============================================================
// AI Coach Assistant — Server Actions
// ============================================================

/**
 * Get or create a conversation for a given session.
 */
export async function getOrCreateConversation(
  sessionId: string
): Promise<{ data: AiAssistantConversation | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: "Not authenticated." };
  }

  // Check for existing conversation
  const { data: existing, error: fetchError } = await supabase
    .from("ai_assistant_conversations")
    .select("*")
    .eq("coach_id", user.id)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return { data: null, error: fetchError.message };
  }

  if (existing) {
    return { data: existing as AiAssistantConversation, error: null };
  }

  // Create new conversation
  const { data: created, error: createError } = await supabase
    .from("ai_assistant_conversations")
    .insert({
      coach_id: user.id,
      session_id: sessionId,
      messages_json: [],
    })
    .select("*")
    .single();

  if (createError) {
    return { data: null, error: createError.message };
  }

  return { data: created as AiAssistantConversation, error: null };
}

/**
 * Get messages from a conversation.
 */
export async function getConversationHistory(
  conversationId: string
): Promise<{
  data: Array<{ role: "user" | "assistant"; content: string; timestamp: string }> | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: "Not authenticated." };
  }

  const { data, error } = await supabase
    .from("ai_assistant_conversations")
    .select("messages_json")
    .eq("id", conversationId)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  const messages = (data?.messages_json ?? []) as Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;

  return { data: messages, error: null };
}

/**
 * Append a message to a conversation's messages_json.
 */
export async function saveConversationMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  // Fetch current messages
  const { data: conversation, error: fetchError } = await supabase
    .from("ai_assistant_conversations")
    .select("messages_json")
    .eq("id", conversationId)
    .single();

  if (fetchError) {
    return { error: fetchError.message };
  }

  const currentMessages = (conversation?.messages_json ?? []) as Array<{
    role: string;
    content: string;
    timestamp: string;
  }>;

  const updatedMessages = [
    ...currentMessages,
    { role, content, timestamp: new Date().toISOString() },
  ];

  const { error: updateError } = await supabase
    .from("ai_assistant_conversations")
    .update({
      messages_json: updatedMessages,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (updateError) {
    return { error: updateError.message };
  }

  return { error: null };
}

/**
 * Count today's AI assistant usage for a coach.
 */
export async function getCoachUsageToday(
  coachId: string
): Promise<{ count: number; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { count: 0, error: "Not authenticated." };
  }

  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("ai_assistant_usage")
    .select("count")
    .eq("coach_id", coachId)
    .eq("usage_date", today)
    .maybeSingle();

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: data?.count ?? 0, error: null };
}

/**
 * Record a usage entry (upsert: increment count for today).
 */
export async function recordUsage(
  coachId: string,
  conversationId: string,
  tokensUsed: number
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  // Suppress unused variable warning — conversationId kept for future analytics
  void conversationId;
  void tokensUsed;

  const today = new Date().toISOString().split("T")[0];

  // Fetch current count
  const { data: existing } = await supabase
    .from("ai_assistant_usage")
    .select("id, count")
    .eq("coach_id", coachId)
    .eq("usage_date", today)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("ai_assistant_usage")
      .update({ count: existing.count + 1 })
      .eq("id", existing.id);

    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("ai_assistant_usage").insert({
    coach_id: coachId,
    usage_date: today,
    count: 1,
  });

  return { error: error?.message ?? null };
}

/**
 * Check the cache for a non-expired response.
 */
export async function getCachedResponse(
  cacheKey: string
): Promise<{ data: string | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: "Not authenticated." };
  }

  const { data, error } = await supabase
    .from("ai_assistant_cache")
    .select("response, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: null, error: null };
  }

  // Check expiry
  if (new Date(data.expires_at) < new Date()) {
    return { data: null, error: null };
  }

  return { data: data.response, error: null };
}

/**
 * Store a response in the cache (7-day TTL).
 */
export async function setCachedResponse(
  cacheKey: string,
  _prompt: string,
  response: string,
  _tokensUsed: number
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { error } = await supabase.from("ai_assistant_cache").upsert(
    {
      cache_key: cacheKey,
      response,
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: "cache_key" }
  );

  return { error: error?.message ?? null };
}
