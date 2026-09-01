// ============================================================
// Centre service emails — weekly digest + term pack
// ============================================================
//
// The portal is pull-only; these two crons are the push half of the
// service loop. Both run on the ADMIN client (no user session in
// cron), aggregate per centre, and email every portal contact
// (client_users) for centres with an active contract. Every send is
// tagged in email_log — the term pack uses that log as its
// idempotency guard so a re-run never double-sends.
//
// All week/term boundaries are Sydney-anchored (lib/utils/sydney-time).

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

const PORTAL_BASE = "https://buildalphakids.app";

interface PortalRecipient {
  id: string;
  name: string;
  email: string;
}

/**
 * centre_id → portal recipients, resolved through BOTH the legacy
 * client_users.centre_id column and the client_user_centres join
 * (migration 053), deduped by email per centre. Service emails were
 * the quiet multi-campus failure: a director defaulted at centre A
 * simply never received centre B's digests.
 */
async function resolvePortalRecipients(
  admin: ReturnType<typeof createSupabaseAdmin>
): Promise<Map<string, PortalRecipient[]>> {
  const [{ data: legacy }, { data: joined }] = await Promise.all([
    admin.from("client_users").select("id, name, email, centre_id"),
    admin
      .from("client_user_centres")
      .select("centre_id, client_users!inner(id, name, email)"),
  ]);

  const byCentre = new Map<string, Map<string, PortalRecipient>>();
  const add = (centreId: string, r: PortalRecipient) => {
    const bucket = byCentre.get(centreId) ?? new Map<string, PortalRecipient>();
    if (!bucket.has(r.email)) bucket.set(r.email, r);
    byCentre.set(centreId, bucket);
  };
  for (const cu of legacy ?? []) {
    add(cu.centre_id, { id: cu.id, name: cu.name, email: cu.email });
  }
  for (const j of joined ?? []) {
    const cu = j.client_users as unknown as PortalRecipient;
    if (cu) add(j.centre_id, cu);
  }
  return new Map(
    [...byCentre.entries()].map(([id, bucket]) => [id, [...bucket.values()]])
  );
}

function fmtDay(dateIso: string): string {
  return new Date(dateIso + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/** Monday of the Sydney week containing `dateIso`. */
function mondayOf(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(dateIso, diff);
}

// ============================================================
// 1. Weekly director digest — Monday mornings
// ============================================================

export async function sendWeeklyCentreDigests(): Promise<{
  centresProcessed: number;
  emailsSent: number;
  skipped: number;
  errors: string[];
}> {
  const admin = createSupabaseAdmin();
  const errors: string[] = [];
  let emailsSent = 0;
  let skipped = 0;

  const today = sydneyTodayIso();
  const weekStart = mondayOf(today);
  const weekEnd = addDays(weekStart, 6);
  const lastWeekStart = addDays(weekStart, -7);
  const lastWeekEnd = addDays(weekStart, -1);

  // Centres with portal users + a live contract. Multi-campus: a
  // contact belongs to a centre by default (client_users.centre_id)
  // OR via client_user_centres — resolve recipients through both, so
  // a director defaulted elsewhere still gets this centre's digest.
  const { data: centres } = await admin
    .from("centres")
    .select("id, name, contract_status, branding_mode")
    .in("contract_status", ["active", "trial"]);
  const recipientsByCentre = await resolvePortalRecipients(admin);

  const withUsers = (centres ?? [])
    .map((c) => ({
      ...c,
      client_users: recipientsByCentre.get(c.id) ?? [],
    }))
    .filter((c) => c.client_users.length > 0);

  for (const centre of withUsers) {
    try {
      // Idempotency: one digest per centre per week, even if the cron
      // retries.
      const { data: already } = await admin
        .from("email_log")
        .select("id")
        .eq("email_type", "weekly_digest")
        .contains("metadata", { centre_id: centre.id, week_start: weekStart })
        .limit(1);
      if (already && already.length > 0) {
        skipped++;
        continue;
      }

      const [thisWeekRes, lastWeekRes, ratingsRes, reportsRes] =
        await Promise.all([
          admin
            .from("sessions")
            .select("date, time, sport")
            .eq("centre_id", centre.id)
            .gte("date", weekStart)
            .lte("date", weekEnd)
            .in("status", ["published", "pending_confirmation", "confirmed"])
            .order("date", { ascending: true }),
          admin
            .from("sessions")
            .select("id", { count: "exact", head: true })
            .eq("centre_id", centre.id)
            .gte("date", lastWeekStart)
            .lte("date", lastWeekEnd)
            .eq("status", "completed"),
          admin
            .from("feedback_ratings")
            .select("rating")
            .eq("centre_id", centre.id)
            .not("rating", "is", null)
            .gte("submitted_at", lastWeekStart)
            .lte("submitted_at", lastWeekEnd + "T23:59:59"),
          admin
            .from("centre_reports")
            .select("id", { count: "exact", head: true })
            .eq("centre_id", centre.id)
            .eq("status", "sent")
            .gte("sent_at", lastWeekStart),
        ]);

      const upcoming = thisWeekRes.data ?? [];
      // Quiet week + quiet last week → nothing worth an email.
      if (upcoming.length === 0 && (lastWeekRes.count ?? 0) === 0) {
        skipped++;
        continue;
      }

      const ratings = ratingsRes.data ?? [];
      const avgRating =
        ratings.length > 0
          ? (
              ratings.reduce((s, r) => s + (r.rating ?? 0), 0) / ratings.length
            ).toFixed(1)
          : null;

      const sessionRows = upcoming
        .map(
          (s) =>
            `<tr><td style="padding:6px 12px 6px 0;color:#334155">${fmtDay(s.date)}</td><td style="padding:6px 12px;color:#334155">${String(s.time).slice(0, 5)}</td><td style="padding:6px 0;font-weight:600;color:#0f172a">${s.sport}</td></tr>`
        )
        .join("");

      const lastWeekLine = [
        `${lastWeekRes.count ?? 0} session${(lastWeekRes.count ?? 0) === 1 ? "" : "s"} delivered`,
        avgRating ? `${avgRating}★ average feedback` : null,
        (reportsRes.count ?? 0) > 0
          ? `${reportsRes.count} new report${(reportsRes.count ?? 0) === 1 ? "" : "s"}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

      // White-label centres (migration 019, like the report emails):
      // the eyebrow, subject and sign-off drop the BAK name.
      const isWhiteLabel = centre.branding_mode === "white_label";
      const eyebrow = isWhiteLabel
        ? "Your week of sport"
        : "Your week with Build Alpha Kids";
      const signoff = isWhiteLabel
        ? "Reply anytime, a real person reads this inbox."
        : "Build Alpha Kids · South-West Sydney · Reply anytime, a real person reads this inbox.";
      const subject = isWhiteLabel
        ? `This week at ${centre.name}`
        : `This week at ${centre.name} — Build Alpha Kids`;

      const html = `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
          <p style="font-size:12px;font-weight:700;letter-spacing:1px;color:#0891B2;text-transform:uppercase">${eyebrow}</p>
          <h1 style="font-size:20px;margin:4px 0 12px">Hi ${centre.name},</h1>
          ${
            upcoming.length > 0
              ? `<p style="font-size:14px;color:#334155">Here's what's on this week:</p>
                 <table style="font-size:14px;border-collapse:collapse;margin:8px 0 16px">${sessionRows}</table>`
              : `<p style="font-size:14px;color:#334155">No sessions scheduled this week.</p>`
          }
          ${lastWeekLine ? `<p style="font-size:14px;color:#334155"><strong>Last week:</strong> ${lastWeekLine}</p>` : ""}
          <a href="${PORTAL_BASE}/client-login" style="display:inline-block;margin-top:12px;background:#0891B2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">Open your portal</a>
          <p style="font-size:12px;color:#94a3b8;margin-top:20px">${signoff}</p>
        </div>`;

      for (const cu of centre.client_users as Array<{
        name: string;
        email: string;
      }>) {
        const result = await sendEmail(
          cu.email,
          subject,
          html,
          "weekly_digest"
        );
        if (result.success) emailsSent++;
        else errors.push(`${centre.name} → ${cu.email}: ${result.error}`);
      }

      // Stamp the idempotency marker regardless of per-recipient
      // hiccups so retries don't spam the ones that succeeded.
      await admin.from("email_log").insert({
        recipient_email: "digest-marker@internal",
        email_type: "weekly_digest",
        subject: `marker ${centre.name}`,
        status: "sent",
        metadata: { centre_id: centre.id, week_start: weekStart, marker: true },
      });
    } catch (err) {
      errors.push(
        `${centre.name}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { centresProcessed: withUsers.length, emailsSent, skipped, errors };
}

// ============================================================
// 2. Term pack — fires once per centre when a term ends
// ============================================================

export async function sendTermPacks(): Promise<{
  termChecked: string | null;
  emailsSent: number;
  skipped: number;
  errors: string[];
}> {
  const admin = createSupabaseAdmin();
  const errors: string[] = [];
  let emailsSent = 0;
  let skipped = 0;

  const today = sydneyTodayIso();

  // The most recently ended term, within a 14-day send window so a
  // paused cron can catch up but ancient terms never re-fire.
  const { data: term } = await admin
    .from("terms")
    .select("id, name, start_date, end_date")
    .lt("end_date", today)
    .gte("end_date", addDays(today, -14))
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!term) return { termChecked: null, emailsSent: 0, skipped: 0, errors };

  const { data: centres } = await admin
    .from("centres")
    .select("id, name, contract_status, branding_mode")
    .in("contract_status", ["active", "trial"]);
  const recipientsByCentre = await resolvePortalRecipients(admin);

  for (const centre of (centres ?? [])
    .map((c) => ({
      ...c,
      client_users: recipientsByCentre.get(c.id) ?? [],
    }))
    .filter((c) => c.client_users.length > 0)) {
    try {
      const { data: already } = await admin
        .from("email_log")
        .select("id")
        .eq("email_type", "term_pack")
        .contains("metadata", { centre_id: centre.id, term_id: term.id })
        .limit(1);
      if (already && already.length > 0) {
        skipped++;
        continue;
      }

      const [sessionsRes, ratingsRes, attendRes, reportsRes] =
        await Promise.all([
          admin
            .from("sessions")
            .select("id, sport")
            .eq("centre_id", centre.id)
            .eq("term_id", term.id)
            .eq("status", "completed"),
          admin
            .from("feedback_ratings")
            .select("rating")
            .eq("centre_id", centre.id)
            .not("rating", "is", null)
            .gte("submitted_at", term.start_date)
            .lte("submitted_at", term.end_date + "T23:59:59"),
          admin
            .from("session_attendances")
            .select("present, sessions!inner(centre_id, term_id)")
            .eq("sessions.centre_id", centre.id)
            .eq("sessions.term_id", term.id),
          admin
            .from("centre_reports")
            .select("title")
            .eq("centre_id", centre.id)
            .eq("term_id", term.id)
            .eq("status", "sent"),
        ]);

      const sessions = sessionsRes.data ?? [];
      // No delivery this term → no pack.
      if (sessions.length === 0) {
        skipped++;
        continue;
      }

      const sports = [...new Set(sessions.map((s) => s.sport))];
      const ratings = ratingsRes.data ?? [];
      const avgRating =
        ratings.length > 0
          ? (
              ratings.reduce((s, r) => s + (r.rating ?? 0), 0) / ratings.length
            ).toFixed(1)
          : null;
      const attendance = attendRes.data ?? [];
      const attendanceRate =
        attendance.length > 0
          ? Math.round(
              (attendance.filter((a) => a.present).length /
                attendance.length) *
                100
            )
          : null;
      const reportTitles = (reportsRes.data ?? []).map((r) => r.title);

      const statCell = (label: string, value: string) =>
        `<td style="padding:12px;text-align:center;background:#ECFEFF;border-radius:10px"><div style="font-size:22px;font-weight:700;color:#0E7490">${value}</div><div style="font-size:11px;color:#155E75;margin-top:2px">${label}</div></td>`;

      const html = `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
          <p style="font-size:12px;font-weight:700;letter-spacing:1px;color:#0891B2;text-transform:uppercase">${term.name} wrap-up</p>
          <h1 style="font-size:20px;margin:4px 0 12px">${centre.name} — what we achieved together</h1>
          <table style="width:100%;border-collapse:separate;border-spacing:6px;margin:12px 0"><tr>
            ${statCell("sessions delivered", String(sessions.length))}
            ${statCell("sports", String(sports.length))}
            ${avgRating ? statCell("avg feedback", `${avgRating}★`) : ""}
            ${attendanceRate !== null ? statCell("attendance", `${attendanceRate}%`) : ""}
          </tr></table>
          <p style="font-size:14px;color:#334155"><strong>Programs delivered:</strong> ${sports.join(", ")}</p>
          ${
            reportTitles.length > 0
              ? `<p style="font-size:14px;color:#334155"><strong>Reports in your portal:</strong> ${reportTitles.join(" · ")}</p>`
              : ""
          }
          <p style="font-size:14px;color:#334155">The full breakdown — attendance trends, session ratings and sport-by-sport charts — is live on your Impact page.</p>
          <a href="${PORTAL_BASE}/client-login" style="display:inline-block;margin-top:8px;background:#0891B2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">See your full term impact</a>
          <p style="font-size:12px;color:#94a3b8;margin-top:20px">${
            centre.branding_mode === "white_label"
              ? "Thanks for a great term of sport — we can't wait for the next one."
              : "Thanks for having us this term — we can't wait for the next one. Build Alpha Kids · South-West Sydney."
          }</p>
        </div>`;

      for (const cu of centre.client_users as Array<{
        name: string;
        email: string;
      }>) {
        const result = await sendEmail(
          cu.email,
          centre.branding_mode === "white_label"
            ? `${term.name} wrap-up — ${centre.name}`
            : `${term.name} wrap-up — ${centre.name} × Build Alpha Kids`,
          html,
          "term_pack"
        );
        if (result.success) emailsSent++;
        else errors.push(`${centre.name} → ${cu.email}: ${result.error}`);
      }

      await admin.from("email_log").insert({
        recipient_email: "termpack-marker@internal",
        email_type: "term_pack",
        subject: `marker ${centre.name} ${term.name}`,
        status: "sent",
        metadata: { centre_id: centre.id, term_id: term.id, marker: true },
      });
    } catch (err) {
      errors.push(
        `${centre.name}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { termChecked: term.name, emailsSent, skipped, errors };
}
