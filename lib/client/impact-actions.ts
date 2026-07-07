"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClientCentreAccess } from "@/lib/client/access";

export interface ImpactStats {
  sessionsThisTerm: number;
  sessionsLastTerm: number;
  totalChildren: number;
  uniqueSportsDelivered: number;
  averageRating: number;
  attendanceRate: number;
  totalSessionsAllTime: number;
}

export interface AttendanceTrend {
  week: string;
  date: string;
  headcount: number;
  sessions: number;
}

export interface RatingTrend {
  month: string;
  rating: number;
}

export interface SportBreakdown {
  sport: string;
  sessions: number;
  percentage: number;
}

export async function getImpactDashboard(centreId: string) {
  // Server actions are public HTTP endpoints — verify centre access
  // before reading anything.
  const access = await requireClientCentreAccess(centreId);
  if (!access.authorised) return null;

  const supabase = await createSupabaseServerClient();

  // Get active term
  const { data: activeTerm } = await supabase
    .from("terms")
    .select("id, name, start_date, end_date")
    .eq("status", "active")
    .single();

  // Get previous term
  const { data: prevTerm } = await supabase
    .from("terms")
    .select("id")
    .eq("status", "completed")
    .order("end_date", { ascending: false })
    .limit(1)
    .single();

  // Sessions this term
  const { count: sessionsThisTerm } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("centre_id", centreId)
    .eq("status", "completed")
    .eq("term_id", activeTerm?.id ?? "");

  // Sessions last term
  const { count: sessionsLastTerm } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("centre_id", centreId)
    .eq("status", "completed")
    .eq("term_id", prevTerm?.id ?? "");

  // Total children
  const { count: totalChildren } = await supabase
    .from("centre_children")
    .select("id", { count: "exact", head: true })
    .eq("centre_id", centreId)
    .eq("status", "active");

  // All completed sessions for this centre (for trends)
  const { data: allSessions } = await supabase
    .from("sessions")
    .select("id, date, sport, headcount, status")
    .eq("centre_id", centreId)
    .eq("status", "completed")
    .order("date", { ascending: true });

  // Average rating (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const { data: ratings } = await supabase
    .from("feedback_ratings")
    .select("rating, created_at")
    .eq("centre_id", centreId)
    .not("rating", "is", null)
    .gte("created_at", sixMonthsAgo.toISOString());

  const avgRating = ratings && ratings.length > 0
    ? ratings.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratings.length
    : 0;

  // Attendance rate
  const { data: attendances } = await supabase
    .from("session_attendances")
    .select("present, session_id, sessions!inner(centre_id, status)")
    .eq("sessions.centre_id", centreId)
    .eq("sessions.status", "completed");

  const attendanceRate = attendances && attendances.length > 0
    ? (attendances.filter((a) => a.present).length / attendances.length) * 100
    : 0;

  // Sport breakdown
  const sportCounts: Record<string, number> = {};
  for (const s of allSessions ?? []) {
    sportCounts[s.sport] = (sportCounts[s.sport] || 0) + 1;
  }
  const totalSessions = allSessions?.length ?? 0;
  const sportBreakdown: SportBreakdown[] = Object.entries(sportCounts)
    .map(([sport, sessions]) => ({
      sport,
      sessions,
      percentage: totalSessions > 0 ? Math.round((sessions / totalSessions) * 100) : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  // Weekly attendance trend (current term)
  const attendanceTrend: AttendanceTrend[] = [];
  if (activeTerm && allSessions) {
    const termSessions = allSessions.filter((s) => s.date >= activeTerm.start_date && s.date <= activeTerm.end_date);
    const termStart = new Date(activeTerm.start_date);
    let weekNum = 1;
    for (let i = 0; i < 12; i++) {
      const weekStart = new Date(termStart);
      weekStart.setDate(termStart.getDate() + i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekSessions = termSessions.filter((s) => s.date >= weekStart.toISOString().slice(0, 10) && s.date <= weekEnd.toISOString().slice(0, 10));
      if (weekSessions.length > 0) {
        attendanceTrend.push({
          week: `Week ${weekNum}`,
          date: weekStart.toISOString().slice(0, 10),
          headcount: weekSessions.reduce((sum, s) => sum + (s.headcount ?? 0), 0),
          sessions: weekSessions.length,
        });
      }
      weekNum++;
    }
  }

  // Monthly rating trend (last 6 months)
  const ratingTrend: RatingTrend[] = [];
  if (ratings) {
    const monthBuckets: Record<string, number[]> = {};
    for (const r of ratings) {
      const month = new Date(r.created_at).toLocaleString("en-AU", { month: "short" });
      if (!monthBuckets[month]) monthBuckets[month] = [];
      monthBuckets[month].push(r.rating ?? 0);
    }
    for (const [month, vals] of Object.entries(monthBuckets)) {
      ratingTrend.push({
        month,
        rating: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      });
    }
  }

  return {
    stats: {
      sessionsThisTerm: sessionsThisTerm ?? 0,
      sessionsLastTerm: sessionsLastTerm ?? 0,
      totalChildren: totalChildren ?? 0,
      uniqueSportsDelivered: Object.keys(sportCounts).length,
      averageRating: Math.round(avgRating * 10) / 10,
      attendanceRate: Math.round(attendanceRate),
      totalSessionsAllTime: totalSessions,
    },
    attendanceTrend,
    ratingTrend,
    sportBreakdown,
    termName: activeTerm?.name ?? "Current Term",
  };
}
