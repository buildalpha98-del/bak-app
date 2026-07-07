"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { triggerNotificationForOps } from "@/lib/notifications/send";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import type { CentreMessage } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface ClientDashboardData {
  centreName: string;
  nextSession: {
    id: string;
    date: string;
    time: string;
    sport: string;
    coach_name: string;
    duration_minutes: number;
  } | null;
  stats: {
    sessionsThisTerm: number;
    totalChildren: number;
    averageRating: number | null;
    attendanceRate: number | null;
  };
  recentSessions: {
    id: string;
    date: string;
    sport: string;
    coach_name: string;
    headcount: number | null;
    rating: number | null;
  }[];
}

export interface ClientSession {
  id: string;
  date: string;
  time: string;
  sport: string;
  duration_minutes: number;
  status: string;
  coach_name: string | null;
  program_title: string | null;
  program_id: string | null;
  headcount: number | null;
  rating: number | null;
  coach_notes: string | null;
}

export interface ClientChild {
  id: string;
  first_name: string;
  last_name: string;
  age_group: string;
  sessions_attended: number;
  total_sessions: number;
  attendance_percentage: number;
  last_attended: string | null;
}

export interface ChildDetail {
  id: string;
  first_name: string;
  last_name: string;
  age_group: string;
  date_of_birth: string | null;
  attendanceHistory: {
    session_id: string;
    date: string;
    sport: string;
    present: boolean;
  }[];
  assessments: {
    term_name: string;
    term_id: string;
    sport: string;
    skills: { skill_name: string; rating: number }[];
    assessed_at: string;
  }[];
}

export interface ClientReport {
  id: string;
  title: string;
  term_name: string;
  term_start: string;
  term_end: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  content_json: Record<string, unknown>;
}

export interface ClientProgram {
  id: string;
  sport: string;
  age_group: string | null;
  skill_focus: string | null;
  content_json: Record<string, unknown>;
  last_delivered: string;
  times_used: number;
}

export interface ClientInvoice {
  id: string;
  invoice_number: string | null;
  period_start: string;
  period_end: string;
  amount: number;
  status: string;
  sent_at: string | null;
  created_at: string;
  pdf_url: string | null;
  total_cents: number | null;
}

export interface CentreMessageWithSender extends CentreMessage {
  sender_name: string;
}

// ============================================================
// Dashboard data
// ============================================================

export async function getClientDashboard(
  centreId: string
): Promise<{ data: ClientDashboardData | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    // "Today" is a Sydney concept — the server runs in another
    // timezone, so a raw toISOString() day-boundary drifts by hours.
    const today = sydneyTodayIso();

    // Get centre name
    const { data: centre } = await supabase
      .from("centres")
      .select("name")
      .eq("id", centreId)
      .single();

    // Get active term
    const { data: activeTerm } = await supabase
      .from("terms")
      .select("id")
      .eq("status", "active")
      .single();

    // Next upcoming session
    const { data: nextSession } = await supabase
      .from("sessions")
      .select("id, date, time, sport, duration_minutes, coach_id, profiles!sessions_coach_id_fkey(name)")
      .eq("centre_id", centreId)
      .gte("date", today)
      .in("status", ["published", "pending_confirmation", "confirmed"])
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(1)
      .single();

    // Sessions this term
    const termFilter = activeTerm?.id;
    let sessionsThisTerm = 0;
    if (termFilter) {
      const { count } = await supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", centreId)
        .eq("term_id", termFilter)
        .neq("status", "cancelled");
      sessionsThisTerm = count ?? 0;
    }

    // Total children enrolled
    const { count: totalChildren } = await supabase
      .from("centre_children")
      .select("id", { count: "exact", head: true })
      .eq("centre_id", centreId)
      .eq("status", "active");

    // Average feedback rating (last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const { data: ratings } = await supabase
      .from("feedback_ratings")
      .select("rating")
      .eq("centre_id", centreId)
      .not("rating", "is", null)
      .gte("submitted_at", threeMonthsAgo.toISOString());

    const avgRating =
      ratings && ratings.length > 0
        ? ratings.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratings.length
        : null;

    // Attendance rate (completed sessions this term)
    let attendanceRate: number | null = null;
    if (termFilter) {
      const { data: completedSessions } = await supabase
        .from("sessions")
        .select("id, headcount")
        .eq("centre_id", centreId)
        .eq("term_id", termFilter)
        .eq("status", "completed");

      if (completedSessions && completedSessions.length > 0) {
        const { count: totalAttendances } = await supabase
          .from("session_attendances")
          .select("id", { count: "exact", head: true })
          .in(
            "session_id",
            completedSessions.map((s) => s.id)
          )
          .eq("present", true);

        const { count: totalPossible } = await supabase
          .from("session_attendances")
          .select("id", { count: "exact", head: true })
          .in(
            "session_id",
            completedSessions.map((s) => s.id)
          );

        if (totalPossible && totalPossible > 0) {
          attendanceRate = Math.round(
            ((totalAttendances ?? 0) / totalPossible) * 100
          );
        }
      }
    }

    // Recent 5 completed sessions
    const { data: recentSessions } = await supabase
      .from("sessions")
      .select(
        "id, date, sport, headcount, coach_id, profiles!sessions_coach_id_fkey(name), feedback_ratings(rating)"
      )
      .eq("centre_id", centreId)
      .eq("status", "completed")
      .order("date", { ascending: false })
      .limit(5);

    const coachProfile = nextSession?.profiles as unknown as { name: string } | null;

    return {
      data: {
        centreName: centre?.name ?? "",
        nextSession: nextSession
          ? {
              id: nextSession.id,
              date: nextSession.date,
              time: nextSession.time,
              sport: nextSession.sport,
              coach_name: coachProfile?.name ?? "TBC",
              duration_minutes: nextSession.duration_minutes,
            }
          : null,
        stats: {
          sessionsThisTerm,
          totalChildren: totalChildren ?? 0,
          averageRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
          attendanceRate,
        },
        recentSessions: (recentSessions ?? []).map((s) => {
          const coach = s.profiles as unknown as { name: string } | null;
          const feedbacks = s.feedback_ratings as unknown as { rating: number | null }[];
          const sessionRating = feedbacks?.[0]?.rating ?? null;
          return {
            id: s.id,
            date: s.date,
            sport: s.sport,
            coach_name: coach?.name ?? "Unknown",
            headcount: s.headcount,
            rating: sessionRating,
          };
        }),
      },
      error: null,
    };
  } catch (err) {
    console.error("getClientDashboard error:", err);
    return { data: null, error: "Failed to load dashboard." };
  }
}

// ============================================================
// Schedule
// ============================================================

export async function getClientSchedule(
  centreId: string,
  view: "upcoming" | "past" = "upcoming"
): Promise<{ data: ClientSession[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = new Date().toISOString().split("T")[0];

    let query = supabase
      .from("sessions")
      .select(
        "id, date, time, sport, duration_minutes, status, headcount, coach_notes, program_id, coach_id, profiles!sessions_coach_id_fkey(name), programs(sport, skill_focus), feedback_ratings(rating)"
      )
      .eq("centre_id", centreId);

    if (view === "upcoming") {
      query = query
        .gte("date", today)
        .in("status", ["published", "pending_confirmation", "confirmed", "in_progress"])
        .order("date", { ascending: true })
        .order("time", { ascending: true });
    } else {
      query = query
        .eq("status", "completed")
        .order("date", { ascending: false })
        .limit(50);
    }

    const { data, error } = await query;

    if (error) return { data: [], error: error.message };

    return {
      data: (data ?? []).map((s) => {
        const coach = s.profiles as unknown as { name: string } | null;
        const program = s.programs as unknown as { sport: string; skill_focus: string | null } | null;
        const feedbacks = s.feedback_ratings as unknown as { rating: number | null }[];
        return {
          id: s.id,
          date: s.date,
          time: s.time,
          sport: s.sport,
          duration_minutes: s.duration_minutes,
          status: s.status,
          coach_name: coach?.name ?? null,
          program_title: program?.skill_focus ?? null,
          program_id: s.program_id,
          headcount: s.headcount,
          rating: feedbacks?.[0]?.rating ?? null,
          coach_notes: s.coach_notes,
        };
      }),
      error: null,
    };
  } catch (err) {
    console.error("getClientSchedule error:", err);
    return { data: [], error: "Failed to load schedule." };
  }
}

export async function getClientSessionDetail(
  sessionId: string,
  centreId: string
): Promise<{ data: ClientSession | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id, date, time, sport, duration_minutes, status, headcount, coach_notes, program_id, coach_id, profiles!sessions_coach_id_fkey(name), programs(sport, skill_focus, content_json), feedback_ratings(rating, comment)"
      )
      .eq("id", sessionId)
      .eq("centre_id", centreId)
      .single();

    if (error || !data) return { data: null, error: error?.message ?? "Session not found." };

    const coach = data.profiles as unknown as { name: string } | null;
    const program = data.programs as unknown as { sport: string; skill_focus: string | null; content_json: Record<string, unknown> } | null;
    const feedbacks = data.feedback_ratings as unknown as { rating: number | null; comment: string | null }[];

    return {
      data: {
        id: data.id,
        date: data.date,
        time: data.time,
        sport: data.sport,
        duration_minutes: data.duration_minutes,
        status: data.status,
        coach_name: coach?.name ?? null,
        program_title: program?.skill_focus ?? null,
        program_id: data.program_id,
        headcount: data.headcount,
        rating: feedbacks?.[0]?.rating ?? null,
        coach_notes: feedbacks?.[0]?.comment ?? data.coach_notes,
      },
      error: null,
    };
  } catch (err) {
    console.error("getClientSessionDetail error:", err);
    return { data: null, error: "Failed to load session." };
  }
}

// ============================================================
// Children
// ============================================================

export async function getClientChildren(
  centreId: string
): Promise<{ data: ClientChild[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get enrolled children
    const { data: enrolments, error } = await supabase
      .from("centre_children")
      .select("child_id, children!inner(id, first_name, last_name, age_group)")
      .eq("centre_id", centreId)
      .eq("status", "active");

    if (error) return { data: [], error: error.message };
    if (!enrolments || enrolments.length === 0) return { data: [], error: null };

    const childIds = enrolments.map((e) => {
      const child = e.children as unknown as { id: string };
      return child.id;
    });

    // Get total completed sessions at this centre
    const { data: completedSessions } = await supabase
      .from("sessions")
      .select("id")
      .eq("centre_id", centreId)
      .eq("status", "completed");

    const sessionIds = (completedSessions ?? []).map((s) => s.id);
    const totalSessions = sessionIds.length;

    // Get attendance records for these children
    let attendanceMap: Record<string, { attended: number; lastDate: string | null }> = {};

    if (sessionIds.length > 0) {
      const { data: attendances } = await supabase
        .from("session_attendances")
        .select("child_id, present, sessions!inner(date)")
        .in("session_id", sessionIds)
        .in("child_id", childIds)
        .eq("present", true);

      for (const att of attendances ?? []) {
        const session = att.sessions as unknown as { date: string };
        if (!attendanceMap[att.child_id]) {
          attendanceMap[att.child_id] = { attended: 0, lastDate: null };
        }
        attendanceMap[att.child_id].attended++;
        if (!attendanceMap[att.child_id].lastDate || session.date > attendanceMap[att.child_id].lastDate!) {
          attendanceMap[att.child_id].lastDate = session.date;
        }
      }
    }

    const children: ClientChild[] = enrolments.map((e) => {
      const child = e.children as unknown as {
        id: string;
        first_name: string;
        last_name: string;
        age_group: string;
      };
      const att = attendanceMap[child.id] ?? { attended: 0, lastDate: null };
      return {
        id: child.id,
        first_name: child.first_name,
        last_name: child.last_name,
        age_group: child.age_group,
        sessions_attended: att.attended,
        total_sessions: totalSessions,
        attendance_percentage:
          totalSessions > 0
            ? Math.round((att.attended / totalSessions) * 100)
            : 0,
        last_attended: att.lastDate,
      };
    });

    return { data: children, error: null };
  } catch (err) {
    console.error("getClientChildren error:", err);
    return { data: [], error: "Failed to load children." };
  }
}

export async function getChildDetail(
  childId: string,
  centreId: string
): Promise<{ data: ChildDetail | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Verify child is enrolled at this centre
    const { data: enrolment } = await supabase
      .from("centre_children")
      .select("child_id, children!inner(id, first_name, last_name, age_group, date_of_birth)")
      .eq("centre_id", centreId)
      .eq("child_id", childId)
      .eq("status", "active")
      .single();

    if (!enrolment) return { data: null, error: "Child not found." };

    const child = enrolment.children as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      age_group: string;
      date_of_birth: string | null;
    };

    // Attendance history
    const { data: attendances } = await supabase
      .from("session_attendances")
      .select("session_id, present, sessions!inner(date, sport, centre_id)")
      .eq("child_id", childId);

    const attendanceHistory = (attendances ?? [])
      .filter((a) => {
        const session = a.sessions as unknown as { centre_id: string };
        return session.centre_id === centreId;
      })
      .map((a) => {
        const session = a.sessions as unknown as { date: string; sport: string };
        return {
          session_id: a.session_id,
          date: session.date,
          sport: session.sport,
          present: a.present,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    // Skill assessments
    const { data: skillRatings } = await supabase
      .from("skill_ratings")
      .select(
        "ratings_json, assessed_at, term_id, terms!inner(name), assessment_templates!inner(sport, centre_id)"
      )
      .eq("child_id", childId);

    const assessments = (skillRatings ?? [])
      .filter((sr) => {
        const template = sr.assessment_templates as unknown as { centre_id: string | null };
        return template.centre_id === centreId || template.centre_id === null;
      })
      .map((sr) => {
        const term = sr.terms as unknown as { name: string };
        const template = sr.assessment_templates as unknown as { sport: string };
        return {
          term_name: term.name,
          term_id: sr.term_id,
          sport: template.sport,
          skills: sr.ratings_json as { skill_name: string; rating: number }[],
          assessed_at: sr.assessed_at,
        };
      })
      .sort((a, b) => b.assessed_at.localeCompare(a.assessed_at));

    return {
      data: {
        id: child.id,
        first_name: child.first_name,
        last_name: child.last_name,
        age_group: child.age_group,
        date_of_birth: child.date_of_birth,
        attendanceHistory,
        assessments,
      },
      error: null,
    };
  } catch (err) {
    console.error("getChildDetail error:", err);
    return { data: null, error: "Failed to load child details." };
  }
}

// ============================================================
// Reports
// ============================================================

export async function getClientReports(
  centreId: string
): Promise<{ data: ClientReport[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("centre_reports")
      .select("id, title, content_json, status, sent_at, created_at, terms!inner(name, start_date, end_date)")
      .eq("centre_id", centreId)
      .eq("status", "sent")
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: error.message };

    return {
      data: (data ?? []).map((r) => {
        const term = r.terms as unknown as { name: string; start_date: string; end_date: string };
        return {
          id: r.id,
          title: r.title,
          term_name: term.name,
          term_start: term.start_date,
          term_end: term.end_date,
          status: r.status,
          sent_at: r.sent_at,
          created_at: r.created_at,
          content_json: r.content_json as Record<string, unknown>,
        };
      }),
      error: null,
    };
  } catch (err) {
    console.error("getClientReports error:", err);
    return { data: [], error: "Failed to load reports." };
  }
}

// ============================================================
// Programs
// ============================================================

export async function getClientPrograms(
  centreId: string
): Promise<{ data: ClientProgram[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get sessions with programs at this centre
    const { data: sessions, error } = await supabase
      .from("sessions")
      .select("date, program_id, programs!inner(id, sport, age_group, skill_focus, content_json)")
      .eq("centre_id", centreId)
      .eq("status", "completed")
      .not("program_id", "is", null)
      .order("date", { ascending: false });

    if (error) return { data: [], error: error.message };

    // Aggregate by program
    const programMap = new Map<string, ClientProgram>();

    for (const s of sessions ?? []) {
      const prog = s.programs as unknown as {
        id: string;
        sport: string;
        age_group: string | null;
        skill_focus: string | null;
        content_json: Record<string, unknown>;
      };
      if (!prog) continue;

      const existing = programMap.get(prog.id);
      if (existing) {
        existing.times_used++;
        if (s.date > existing.last_delivered) {
          existing.last_delivered = s.date;
        }
      } else {
        programMap.set(prog.id, {
          id: prog.id,
          sport: prog.sport,
          age_group: prog.age_group,
          skill_focus: prog.skill_focus,
          content_json: prog.content_json,
          last_delivered: s.date,
          times_used: 1,
        });
      }
    }

    return {
      data: Array.from(programMap.values()).sort(
        (a, b) => b.last_delivered.localeCompare(a.last_delivered)
      ),
      error: null,
    };
  } catch (err) {
    console.error("getClientPrograms error:", err);
    return { data: [], error: "Failed to load programs." };
  }
}

// ============================================================
// Messages
// ============================================================

export async function getCentreMessages(
  centreId: string
): Promise<{ data: CentreMessageWithSender[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("centre_messages")
      .select("*, client_users(name), profiles(name)")
      .eq("centre_id", centreId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) return { data: [], error: error.message };

    // Opening the thread is the read action: mark staff replies read
    // so the nav badge clears. Fire-and-forget — display never blocks
    // on the bookkeeping write.
    const hasUnreadStaff = (data ?? []).some(
      (m) => m.sender_type === "staff" && !m.read_at
    );
    if (hasUnreadStaff) {
      void supabase
        .from("centre_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("centre_id", centreId)
        .eq("sender_type", "staff")
        .is("read_at", null)
        .then(({ error: markErr }) => {
          if (markErr) console.error("mark staff messages read:", markErr);
        });
    }

    return {
      data: (data ?? []).map((m) => {
        const clientUser = m.client_users as unknown as { name: string } | null;
        const staffUser = m.profiles as unknown as { name: string } | null;
        return {
          id: m.id,
          centre_id: m.centre_id,
          sender_type: m.sender_type as "client" | "staff",
          sender_client_id: m.sender_client_id,
          sender_staff_id: m.sender_staff_id,
          content: m.content,
          read_at: m.read_at,
          created_at: m.created_at,
          sender_name:
            m.sender_type === "client"
              ? clientUser?.name ?? "Centre Contact"
              : staffUser?.name ?? "Build Alpha Kids",
        };
      }),
      error: null,
    };
  } catch (err) {
    console.error("getCentreMessages error:", err);
    return { data: [], error: "Failed to load messages." };
  }
}

export async function sendCentreMessage(
  centreId: string,
  content: string,
  senderType: "client" | "staff"
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not authenticated." };

    if (senderType === "client") {
      // Get client_user record
      const { data: clientUser } = await supabase
        .from("client_users")
        .select("id")
        .eq("user_id", user.id)
        .eq("centre_id", centreId)
        .single();

      if (!clientUser) return { error: "Not authorised." };

      const { error } = await supabase.from("centre_messages").insert({
        centre_id: centreId,
        sender_type: "client",
        sender_client_id: clientUser.id,
        content,
      });

      if (error) return { error: error.message };

      // Surface the message to staff — without this, a director's
      // message sits in centre_messages with no admin-side inbox and
      // nobody ever finds out it arrived. Fire-and-forget so a
      // notification hiccup can't fail the send itself.
      const { data: centre } = await supabase
        .from("centres")
        .select("name")
        .eq("id", centreId)
        .single();

      triggerNotificationForOps({
        type: "centre_message_received",
        title: `New message from ${centre?.name ?? "a centre"}`,
        body: content.length > 140 ? `${content.slice(0, 140)}…` : content,
        entityType: "centre",
        entityId: centreId,
      }).catch((err) =>
        console.error("centre message ops notification failed:", err)
      );
    } else {
      const { error } = await supabase.from("centre_messages").insert({
        centre_id: centreId,
        sender_type: "staff",
        sender_staff_id: user.id,
        content,
      });

      if (error) return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    console.error("sendCentreMessage error:", err);
    return { error: "Failed to send message." };
  }
}

/**
 * Unread staff replies across the centre — drives the Messages nav
 * badge in the client shell.
 */
export async function getClientUnreadMessageCount(
  centreId: string
): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    const { count } = await supabase
      .from("centre_messages")
      .select("id", { count: "exact", head: true })
      .eq("centre_id", centreId)
      .eq("sender_type", "staff")
      .is("read_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ============================================================
// Invoices
// ============================================================

export async function getClientInvoices(
  centreId: string
): Promise<{ data: ClientInvoice[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("outbound_invoices")
      .select("id, invoice_number, period_start, period_end, amount, status, sent_at, created_at, pdf_url, total_cents")
      .eq("centre_id", centreId)
      .in("status", ["sent", "partially_paid", "paid", "overdue"])
      .order("period_start", { ascending: false });

    if (error) return { data: [], error: error.message };

    return {
      data: (data ?? []).map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        period_start: inv.period_start,
        period_end: inv.period_end,
        // Cents are the source of truth; the legacy float `amount`
        // only backfills rows created before the cents columns.
        amount:
          inv.total_cents != null ? inv.total_cents / 100 : inv.amount,
        status: inv.status,
        sent_at: inv.sent_at,
        created_at: inv.created_at,
        pdf_url: inv.pdf_url ?? null,
        total_cents: inv.total_cents ?? null,
      })),
      error: null,
    };
  } catch (err) {
    console.error("getClientInvoices error:", err);
    return { data: [], error: "Failed to load invoices." };
  }
}

// ============================================================
// Program detail (for viewing full program)
// ============================================================

export async function getClientProgramDetail(
  programId: string,
  centreId: string
): Promise<{ data: ClientProgram | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Verify program was used at this centre
    const { data: session } = await supabase
      .from("sessions")
      .select("date")
      .eq("centre_id", centreId)
      .eq("program_id", programId)
      .order("date", { ascending: false })
      .limit(1)
      .single();

    if (!session) return { data: null, error: "Program not found." };

    const { data: program, error } = await supabase
      .from("programs")
      .select("id, sport, age_group, skill_focus, content_json")
      .eq("id", programId)
      .single();

    if (error || !program) return { data: null, error: "Program not found." };

    // Count usage
    const { count } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("centre_id", centreId)
      .eq("program_id", programId);

    return {
      data: {
        id: program.id,
        sport: program.sport,
        age_group: program.age_group,
        skill_focus: program.skill_focus,
        content_json: program.content_json as Record<string, unknown>,
        last_delivered: session.date,
        times_used: count ?? 1,
      },
      error: null,
    };
  } catch (err) {
    console.error("getClientProgramDetail error:", err);
    return { data: null, error: "Failed to load program." };
  }
}
