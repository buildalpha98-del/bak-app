"use server";

import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { autoCreateTask } from "@/lib/tasks/auto-create";
import { triggerNotificationForOps } from "@/lib/notifications/send";

// ============================================================
// Feedback server actions
// ============================================================

/**
 * Create a pending feedback request (called after session completion).
 * Inserts a row with NULL rating — the centre fills it in via public link.
 * Returns the feedback_token UUID.
 */
export async function createFeedbackRequest(
  sessionId: string,
  centreId: string,
  coachId: string,
  sport: string
): Promise<{ token: string | null; error: string | null }> {
  const admin = createSupabaseAdmin();

  // Dedup: skip if a feedback request already exists for this session
  const { data: existing } = await admin
    .from("feedback_ratings")
    .select("feedback_token")
    .eq("session_id", sessionId)
    .limit(1)
    .single();

  if (existing) {
    return { token: existing.feedback_token, error: null };
  }

  const { data, error } = await admin
    .from("feedback_ratings")
    .insert({
      session_id: sessionId,
      centre_id: centreId,
      coach_id: coachId,
      sport,
      // rating is NULL (pending)
    })
    .select("feedback_token")
    .single();

  if (error) return { token: null, error: error.message };
  return { token: data.feedback_token, error: null };
}

/**
 * Get feedback details by token (for public page).
 * Returns session context + whether already submitted.
 */
export async function getFeedbackByToken(token: string): Promise<{
  data: {
    id: string;
    rating: number | null;
    comment: string | null;
    submitted_at: string | null;
    session: {
      date: string;
      sport: string;
      coach_name: string;
      centre_name: string;
    };
  } | null;
  error: string | null;
}> {
  const admin = createSupabaseAdmin();

  const { data, error } = await admin
    .from("feedback_ratings")
    .select(
      `
      id,
      rating,
      comment,
      submitted_at,
      session_id,
      centre_id,
      coach_id,
      sport
    `
    )
    .eq("feedback_token", token)
    .single();

  if (error || !data) return { data: null, error: "Invalid feedback link." };

  // Get session details
  const { data: session } = await admin
    .from("sessions")
    .select("date, sport")
    .eq("id", data.session_id)
    .single();

  // Get centre name
  const { data: centre } = await admin
    .from("centres")
    .select("name")
    .eq("id", data.centre_id)
    .single();

  // Get coach name
  let coachName = "Your coach";
  if (data.coach_id) {
    const { data: coach } = await admin
      .from("profiles")
      .select("name")
      .eq("id", data.coach_id)
      .single();
    if (coach) coachName = coach.name;
  }

  return {
    data: {
      id: data.id,
      rating: data.rating,
      comment: data.comment,
      submitted_at: data.submitted_at,
      session: {
        date: session?.date ?? "",
        sport: data.sport ?? session?.sport ?? "",
        coach_name: coachName,
        centre_name: centre?.name ?? "",
      },
    },
    error: null,
  };
}

/**
 * Submit feedback from public page (called by API route).
 * Updates the existing record with rating + comment + submitted_at.
 * If rating ≤ 2, auto-creates a Kanban task + notifies ops.
 */
export async function submitPublicFeedback(
  token: string,
  rating: number,
  comment: string | null
): Promise<{ error: string | null }> {
  if (rating < 1 || rating > 5) return { error: "Invalid rating." };

  const admin = createSupabaseAdmin();

  // Fetch existing record
  const { data: existing, error: fetchError } = await admin
    .from("feedback_ratings")
    .select("id, session_id, centre_id, coach_id, sport, submitted_at")
    .eq("feedback_token", token)
    .single();

  if (fetchError || !existing) return { error: "Invalid feedback link." };
  if (existing.submitted_at) return { error: "Feedback already submitted." };

  // Update with rating
  const { error: updateError } = await admin
    .from("feedback_ratings")
    .update({
      rating,
      comment: comment?.trim() || null,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (updateError) return { error: "Failed to submit feedback." };

  // Get centre name for task/notification
  const { data: centre } = await admin
    .from("centres")
    .select("name")
    .eq("id", existing.centre_id)
    .single();
  const centreName = centre?.name ?? "Unknown Centre";

  // Low rating alert (1 or 2 stars)
  if (rating <= 2) {
    // Auto-create Kanban task
    await autoCreateTask({
      title: `Low session rating at ${centreName} — ${rating}/5`,
      description: comment
        ? `Rating: ${rating}/5\nComment: ${comment}`
        : `Rating: ${rating}/5`,
      priority: "high",
      linkedEntityType: "session",
      linkedEntityId: existing.session_id,
      source: "low_session_rating",
    });

    // Notify ops
    await triggerNotificationForOps({
      type: "low_session_rating",
      title: `Low Session Rating: ${rating}/5`,
      body: `${centreName} rated a session ${rating}/5.${comment ? ` Comment: "${comment}"` : ""}`,
      entityType: "session",
      entityId: existing.session_id,
    });
  }

  // Informational notification for all feedback
  if (rating > 2) {
    await triggerNotificationForOps({
      type: "feedback_received",
      title: "Session Feedback Received",
      body: `${centreName} rated a session ${rating}/5.`,
      entityType: "session",
      entityId: existing.session_id,
    });
  }

  return { error: null };
}

// ============================================================
// Dashboard & list query actions
// ============================================================

export interface FeedbackListFilters {
  centreId?: string;
  coachId?: string;
  sport?: string;
  minRating?: number;
  maxRating?: number;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface FeedbackListItem {
  id: string;
  rating: number;
  comment: string | null;
  submitted_at: string;
  sport: string | null;
  centre: { id: string; name: string };
  coach: { id: string; name: string } | null;
  session: { id: string; date: string };
}

/**
 * Get paginated feedback list with filters (admin/ops).
 */
export async function getFeedbackList(filters: FeedbackListFilters = {}): Promise<{
  data: FeedbackListItem[];
  total: number;
  error: string | null;
}> {
  const supabase = await createSupabaseServer();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("feedback_ratings")
    .select(
      `
      id,
      rating,
      comment,
      submitted_at,
      sport,
      centre_id,
      coach_id,
      session_id,
      centres!inner(id, name),
      profiles(id, name),
      sessions!inner(id, date)
    `,
      { count: "exact" }
    )
    .not("submitted_at", "is", null)
    .not("rating", "is", null)
    .order("submitted_at", { ascending: false });

  if (filters.centreId) query = query.eq("centre_id", filters.centreId);
  if (filters.coachId) query = query.eq("coach_id", filters.coachId);
  if (filters.sport) query = query.eq("sport", filters.sport);
  if (filters.minRating) query = query.gte("rating", filters.minRating);
  if (filters.maxRating) query = query.lte("rating", filters.maxRating);
  if (filters.dateFrom)
    query = query.gte("submitted_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("submitted_at", filters.dateTo);

  query = query.range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;

  if (error) return { data: [], total: 0, error: error.message };

  const items: FeedbackListItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    rating: row.rating as number,
    comment: row.comment as string | null,
    submitted_at: row.submitted_at as string,
    sport: row.sport as string | null,
    centre: row.centres as { id: string; name: string },
    coach: row.profiles as { id: string; name: string } | null,
    session: row.sessions as { id: string; date: string },
  }));

  return { data: items, total: count ?? 0, error: null };
}

/**
 * Get global feedback aggregation (admin dashboard).
 */
export async function getFeedbackAggregation(): Promise<{
  data: {
    averageRating: number;
    totalCount: number;
    last30DaysAvg: number;
    prior30DaysAvg: number;
    last30DaysCount: number;
  } | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServer();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // All submitted ratings
  const { data: allRatings, error } = await supabase
    .from("feedback_ratings")
    .select("rating, submitted_at")
    .not("submitted_at", "is", null)
    .not("rating", "is", null);

  if (error) return { data: null, error: error.message };

  const ratings = allRatings ?? [];
  const totalCount = ratings.length;
  const averageRating =
    totalCount > 0
      ? ratings.reduce((sum, r) => sum + (r.rating ?? 0), 0) / totalCount
      : 0;

  const last30 = ratings.filter(
    (r) => new Date(r.submitted_at!) >= thirtyDaysAgo
  );
  const prior30 = ratings.filter(
    (r) =>
      new Date(r.submitted_at!) >= sixtyDaysAgo &&
      new Date(r.submitted_at!) < thirtyDaysAgo
  );

  const last30DaysAvg =
    last30.length > 0
      ? last30.reduce((sum, r) => sum + (r.rating ?? 0), 0) / last30.length
      : 0;
  const prior30DaysAvg =
    prior30.length > 0
      ? prior30.reduce((sum, r) => sum + (r.rating ?? 0), 0) / prior30.length
      : 0;

  return {
    data: {
      averageRating: Math.round(averageRating * 10) / 10,
      totalCount,
      last30DaysAvg: Math.round(last30DaysAvg * 10) / 10,
      prior30DaysAvg: Math.round(prior30DaysAvg * 10) / 10,
      last30DaysCount: last30.length,
    },
    error: null,
  };
}

/**
 * Get feedback stats for a specific centre.
 */
export async function getCentreFeedbackStats(centreId: string): Promise<{
  data: {
    averageRating: number;
    totalCount: number;
    recent: { rating: number; comment: string | null; submitted_at: string; coach_name: string }[];
  } | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServer();

  const { data: ratings, error } = await supabase
    .from("feedback_ratings")
    .select("rating, comment, submitted_at, coach_id, profiles(name)")
    .eq("centre_id", centreId)
    .not("submitted_at", "is", null)
    .not("rating", "is", null)
    .order("submitted_at", { ascending: false });

  if (error) return { data: null, error: error.message };

  const all = ratings ?? [];
  const totalCount = all.length;
  const averageRating =
    totalCount > 0
      ? all.reduce((sum, r) => sum + (r.rating ?? 0), 0) / totalCount
      : 0;

  const recent = all.slice(0, 10).map((r: Record<string, unknown>) => ({
    rating: r.rating as number,
    comment: r.comment as string | null,
    submitted_at: r.submitted_at as string,
    coach_name: (r.profiles as { name: string } | null)?.name ?? "Unknown",
  }));

  return {
    data: {
      averageRating: Math.round(averageRating * 10) / 10,
      totalCount,
      recent,
    },
    error: null,
  };
}

/**
 * Get feedback stats for a specific coach.
 */
export async function getCoachFeedbackStats(coachId: string): Promise<{
  data: {
    averageRating: number;
    totalCount: number;
    recent: { rating: number; comment: string | null; submitted_at: string; centre_name: string }[];
  } | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServer();

  const { data: ratings, error } = await supabase
    .from("feedback_ratings")
    .select("rating, comment, submitted_at, centre_id, centres(name)")
    .eq("coach_id", coachId)
    .not("submitted_at", "is", null)
    .not("rating", "is", null)
    .order("submitted_at", { ascending: false });

  if (error) return { data: null, error: error.message };

  const all = ratings ?? [];
  const totalCount = all.length;
  const averageRating =
    totalCount > 0
      ? all.reduce((sum, r) => sum + (r.rating ?? 0), 0) / totalCount
      : 0;

  const recent = all.slice(0, 10).map((r: Record<string, unknown>) => ({
    rating: r.rating as number,
    comment: r.comment as string | null,
    submitted_at: r.submitted_at as string,
    centre_name: (r.centres as { name: string } | null)?.name ?? "Unknown",
  }));

  return {
    data: {
      averageRating: Math.round(averageRating * 10) / 10,
      totalCount,
      recent,
    },
    error: null,
  };
}

/**
 * Get feedback stats grouped by sport.
 */
export async function getSportFeedbackStats(): Promise<{
  data: { sport: string; averageRating: number; count: number }[];
  error: string | null;
}> {
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("feedback_ratings")
    .select("sport, rating")
    .not("submitted_at", "is", null)
    .not("rating", "is", null)
    .not("sport", "is", null);

  if (error) return { data: [], error: error.message };

  const byGroup = new Map<string, number[]>();
  for (const r of data ?? []) {
    if (!r.sport) continue;
    const arr = byGroup.get(r.sport) ?? [];
    arr.push(r.rating!);
    byGroup.set(r.sport, arr);
  }

  const stats = Array.from(byGroup.entries())
    .map(([sport, ratings]) => ({
      sport,
      averageRating:
        Math.round(
          (ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10
        ) / 10,
      count: ratings.length,
    }))
    .sort((a, b) => b.count - a.count);

  return { data: stats, error: null };
}

/**
 * Get recent feedback (for widgets).
 */
export async function getRecentFeedback(limit = 5): Promise<{
  data: {
    id: string;
    rating: number;
    comment: string | null;
    submitted_at: string;
    centre_name: string;
    coach_name: string;
    sport: string | null;
  }[];
  error: string | null;
}> {
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("feedback_ratings")
    .select(
      `
      id,
      rating,
      comment,
      submitted_at,
      sport,
      centres(name),
      profiles(name)
    `
    )
    .not("submitted_at", "is", null)
    .not("rating", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };

  const items = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    rating: r.rating as number,
    comment: r.comment as string | null,
    submitted_at: r.submitted_at as string,
    centre_name: (r.centres as { name: string } | null)?.name ?? "Unknown",
    coach_name: (r.profiles as { name: string } | null)?.name ?? "Unknown",
    sport: r.sport as string | null,
  }));

  return { data: items, error: null };
}
