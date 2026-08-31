"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireClientCentreAccess } from "@/lib/client/access";
import { yearGroupSortKey } from "@/lib/schools/year-groups";

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

export interface ClassRollup {
  id: string;
  name: string;
  year_group: string;
  teacher_name: string | null;
  student_count: number;
  /** % of this term's attendance records marked present. Null before any records. */
  attendance_percentage: number | null;
  /** Average skill mark (1-5) across the class this term. Null before assessment. */
  avg_mark: number | null;
  /** avg_mark minus last term's, one decimal. Null without both terms. */
  mark_delta: number | null;
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

  // Per-class rollups (schools with a class list — design phase 2).
  // "3B: 92% attendance, marks up 0.6 this term" is the sentence a
  // principal repeats in a staff meeting, so it gets its own section.
  const classRollups: ClassRollup[] = [];
  const { data: classes } = await supabase
    .from("school_classes")
    .select("id, name, year_group, teacher_name, school_year")
    .eq("centre_id", centreId);
  if (classes && classes.length > 0 && activeTerm) {
    const latestYear = Math.max(...classes.map((c) => c.school_year));
    const currentClasses = classes.filter((c) => c.school_year === latestYear);
    const { data: members } = await supabase
      .from("school_class_children")
      .select("class_id, child_id")
      .in("class_id", currentClasses.map((c) => c.id))
      .is("ended_at", null);
    const childIds = Array.from(new Set((members ?? []).map((m) => m.child_id)));

    const termSessionIds = (allSessions ?? [])
      .filter((s) => s.date >= activeTerm.start_date && s.date <= activeTerm.end_date)
      .map((s) => s.id);

    const [{ data: termAttendance }, { data: termMarks }, { data: prevMarks }] =
      await Promise.all([
        termSessionIds.length > 0 && childIds.length > 0
          ? supabase
              .from("session_attendances")
              .select("child_id, present")
              .in("session_id", termSessionIds)
              .in("child_id", childIds)
          : Promise.resolve({ data: [] as { child_id: string; present: boolean }[] }),
        childIds.length > 0
          ? supabase
              .from("skill_ratings")
              .select("child_id, ratings_json")
              .eq("term_id", activeTerm.id)
              .in("child_id", childIds)
          : Promise.resolve({ data: [] }),
        childIds.length > 0 && prevTerm
          ? supabase
              .from("skill_ratings")
              .select("child_id, ratings_json")
              .eq("term_id", prevTerm.id)
              .in("child_id", childIds)
          : Promise.resolve({ data: [] }),
      ]);

    function avgMarkByChild(
      rows: { child_id: string; ratings_json: unknown }[] | null
    ): Map<string, number[]> {
      const byChild = new Map<string, number[]>();
      for (const row of rows ?? []) {
        const marks = ((row.ratings_json as { rating: number }[]) ?? [])
          .map((s) => s.rating)
          .filter((n) => Number.isFinite(n));
        if (marks.length === 0) continue;
        byChild.set(row.child_id, [...(byChild.get(row.child_id) ?? []), ...marks]);
      }
      return byChild;
    }
    const termByChild = avgMarkByChild(termMarks as never);
    const prevByChild = avgMarkByChild(prevMarks as never);
    const attByChild = new Map<string, { present: number; total: number }>();
    for (const a of termAttendance ?? []) {
      const cur = attByChild.get(a.child_id) ?? { present: 0, total: 0 };
      cur.total++;
      if (a.present) cur.present++;
      attByChild.set(a.child_id, cur);
    }

    for (const cls of currentClasses) {
      const clsChildIds = (members ?? [])
        .filter((m) => m.class_id === cls.id)
        .map((m) => m.child_id);

      let present = 0;
      let total = 0;
      const termMarksAll: number[] = [];
      const prevMarksAll: number[] = [];
      for (const id of clsChildIds) {
        const att = attByChild.get(id);
        if (att) {
          present += att.present;
          total += att.total;
        }
        termMarksAll.push(...(termByChild.get(id) ?? []));
        prevMarksAll.push(...(prevByChild.get(id) ?? []));
      }
      const avg = (xs: number[]) =>
        xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      const avgMark = avg(termMarksAll);
      const prevAvg = avg(prevMarksAll);

      classRollups.push({
        id: cls.id,
        name: cls.name,
        year_group: cls.year_group,
        teacher_name: cls.teacher_name,
        student_count: clsChildIds.length,
        attendance_percentage: total > 0 ? Math.round((present / total) * 100) : null,
        avg_mark: avgMark == null ? null : Math.round(avgMark * 10) / 10,
        mark_delta:
          avgMark == null || prevAvg == null
            ? null
            : Math.round((avgMark - prevAvg) * 10) / 10,
      });
    }
    classRollups.sort(
      (a, b) =>
        yearGroupSortKey(a.year_group) - yearGroupSortKey(b.year_group) ||
        a.name.localeCompare(b.name)
    );
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
    classRollups,
    termName: activeTerm?.name ?? "Current Term",
  };
}
