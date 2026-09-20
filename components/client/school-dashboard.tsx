import Link from "@/components/ui/app-link";
import {
  CalendarRange,
  ClipboardCheck,
  FileCheck2,
  ListChecks,
  BookOpen,
  Sparkles,
  ArrowRight,
  CalendarDays,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SUBJECTS, SUBJECT_KEYS } from "@/lib/curriculum/subjects";
import { frameworkOf } from "@/lib/curriculum/frameworks";
import { yearGroupLabel } from "@/lib/schools/year-groups";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";
import type { SchoolDashboardData } from "@/lib/client/school-dashboard-actions";

// The school's landing page: term plans, assessments and report cards
// at a glance, this week's lessons and sessions, and the four things a
// principal or teacher does most. Server component — no client state.

function fmtDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: SYDNEY_TZ });
}
function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function fmtDate(iso: string | null): string | null {
  return iso ? new Date(iso.includes("T") ? iso : `${iso}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: SYDNEY_TZ }) : null;
}

export function SchoolDashboard({ data, centreId, firstName }: { data: SchoolDashboardData; centreId: string; firstName: string }) {
  const framework = frameworkOf(data.frameworkKey);
  const { term, planCounts, assessments, release, quizzes, thisWeek } = data;
  const pct = assessments.total > 0 ? Math.round((assessments.done / assessments.total) * 100) : 0;
  const base = `/client/${centreId}`;
  const tile = "rounded-2xl border border-portal-200 bg-white p-4";

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">
            {data.isTeacher ? `Your classes, ${firstName}` : data.schoolName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {term
              ? `${term.name} · Week ${term.currentWeek ?? "–"} of ${term.weekCount} · ${framework.label}`
              : "No active term"}
            {!data.isTeacher && ` · ${data.students} students`}
          </p>
        </div>
        <Link href={`${base}/curriculum/plan`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl bg-portal-600 px-4 py-2 text-sm font-medium text-white hover:bg-portal-700">
          <CalendarRange className="h-4 w-4" /> Plan the term
        </Link>
      </div>

      {/* Status tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={`${base}/curriculum`} className={`${tile} hover:bg-portal-50`}>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><CalendarRange className="h-4 w-4 text-portal-600" /> Term plans</div>
          <p className="mt-2 text-2xl font-bold text-foreground">{planCounts.approved} <span className="text-base font-medium text-muted-foreground">approved</span></p>
          <p className="text-xs text-muted-foreground">{planCounts.draft} draft · {planCounts.missing} not yet planned</p>
        </Link>
        <Link href={`${base}/assessments`} className={`${tile} hover:bg-portal-50`}>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><ClipboardCheck className="h-4 w-4 text-portal-600" /> Assessments</div>
          <p className="mt-2 text-2xl font-bold text-foreground">{pct}% <span className="text-base font-medium text-muted-foreground">complete</span></p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-portal-100"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-xs text-muted-foreground">{assessments.done} of {assessments.total} student assessments</p>
        </Link>
        <Link href={`${base}/assessments`} className={`${tile} hover:bg-portal-50`}>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><FileCheck2 className="h-4 w-4 text-portal-600" /> Report cards</div>
          <p className="mt-2 text-2xl font-bold text-foreground">{release?.released_at ? "Released" : "Not released"}</p>
          <p className="text-xs text-muted-foreground">
            {release?.released_at
              ? `Released ${fmtDate(release.released_at)}${release.released_by_name ? ` by ${release.released_by_name}` : ""}`
              : release?.due_date
                ? `Teachers to finish by ${fmtDate(release.due_date)}`
                : "No due date set"}
          </p>
        </Link>
        <Link href={`${base}/assessments`} className={`${tile} hover:bg-portal-50`}>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><ListChecks className="h-4 w-4 text-portal-600" /> Knowledge checks</div>
          <p className="mt-2 text-2xl font-bold text-foreground">{quizzes.count}</p>
          <p className="text-xs text-muted-foreground">{quizzes.marked} student results marked</p>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* This week */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><CalendarDays className="h-5 w-5 text-portal-500" /> This week{term?.currentWeek ? ` · Week ${term.currentWeek}` : ""}</h2>
          {thisWeek.lessons.length === 0 && thisWeek.sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-portal-200 p-6 text-sm text-muted-foreground">
              Nothing on the Scope &amp; Sequence for this week yet.{" "}
              <Link href={`${base}/programs/generate`} className="text-portal-700 underline">Write a lesson</Link>.
            </div>
          ) : (
            <ul className="divide-y divide-portal-100 rounded-2xl border border-portal-200 bg-white">
              {thisWeek.lessons.map((l) => (
                <li key={l.id}>
                  <Link href={`${base}/programs/${l.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-portal-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{l.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {SUBJECTS[l.subject as keyof typeof SUBJECTS]?.label ?? l.subject} lesson{l.class_name ? ` · ${l.class_name}` : ""}{l.author_name ? ` · ${l.author_name}` : ""}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-portal-500" />
                  </Link>
                </li>
              ))}
              {thisWeek.sessions.map((s) => (
                <li key={s.id}>
                  <Link href={`${base}/schedule/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-portal-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{s.sport} coaching session</span>
                      <span className="block text-xs text-muted-foreground">
                        {fmtDay(s.date)} · {fmtTime(s.time)} · {s.coach_name}{s.class_names.length ? ` · ${s.class_names.join(", ")}` : ""}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-portal-500" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Assessments behind */}
          {assessments.behind.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Assessments still open</h3>
              <ul className="divide-y divide-portal-100 rounded-2xl border border-portal-200 bg-white">
                {assessments.behind.map((b) => (
                  <li key={`${b.class_id}#${b.template_id}`}>
                    <Link
                      href={b.class_id ? `${base}/assessments/${b.class_id}/${b.template_id}` : `${base}/assessments`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-portal-50"
                    >
                      <span>
                        <span className="font-medium text-foreground">{b.class_name ?? "Unassigned"}</span>
                        <span className="text-muted-foreground"> · {SUBJECTS[b.subject].label} · {b.sport}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{b.done} / {b.total}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Plans by class */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><BookOpen className="h-5 w-5 text-portal-500" /> Term plans by class</h2>
          {data.planMatrix.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-portal-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-portal-100 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Class</th>
                    {SUBJECT_KEYS.map((k) => (
                      <th key={k} className="px-2 py-2 text-center font-medium">{SUBJECTS[k].label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.planMatrix.map((row) => (
                    <tr key={row.class_id} className="border-b border-portal-100 last:border-0">
                      <td className="px-3 py-2 font-medium text-foreground">
                        {row.class_name} <span className="text-xs font-normal text-muted-foreground">{yearGroupLabel(row.year_group)}</span>
                      </td>
                      {SUBJECT_KEYS.map((k) => {
                        const p = row.subjects[k];
                        return (
                          <td key={k} className="px-2 py-2 text-center">
                            {p ? (
                              <Link href={`${base}/curriculum`} aria-label={`${row.class_name} ${SUBJECTS[k].label} plan: ${p.status}`}>
                                <Badge className={p.status === "approved" ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}>
                                  {p.status === "approved" ? "Approved" : "Draft"}
                                </Badge>
                              </Link>
                            ) : (
                              <Link href={`${base}/curriculum/plan?classId=${row.class_id}&subject=${k}`} className="text-xs text-portal-700 hover:underline" aria-label={`Plan ${SUBJECTS[k].label} for ${row.class_name}`}>
                                Plan
                              </Link>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Assessment progress by subject */}
          {assessments.bySubject.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-portal-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-foreground">Assessment progress by subject</h3>
              {assessments.bySubject.map((s) => {
                const p = s.total ? Math.round((s.done / s.total) * 100) : 0;
                return (
                  <div key={s.subject}>
                    <div className="flex justify-between text-xs"><span className="font-medium text-foreground">{s.label}</span><span className="tabular-nums text-muted-foreground">{s.done} / {s.total}</span></div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-portal-100"><div className="h-full bg-emerald-500" style={{ width: `${p}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: `${base}/programs/generate`, label: "Write a lesson", icon: Sparkles },
          { href: `${base}/assessments`, label: "Assess a class", icon: ClipboardCheck },
          { href: `${base}/curriculum`, label: "Scope & Sequence", icon: BookOpen },
          { href: `${base}/children`, label: "Students", icon: Users },
        ].map((a) => (
          <Link key={a.href} href={a.href} className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-portal-200 bg-white px-4 py-3 text-sm font-medium text-foreground hover:bg-portal-50">
            <a.icon className="h-4 w-4 text-portal-600" /> {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
