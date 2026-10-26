"use client";

// Monthly bookings: one month of centre & school sessions. Three reads
// of the same data — the totals, a calendar of which centres run each
// day, and a row per school/centre with its pattern (days, sports,
// times), coach state and value. Expand a row for its dates; every date
// links to that week on the roster.

import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Lock } from "lucide-react";
import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";
import {
  buildMonthBookings,
  shiftMonth,
  type CentreMonth,
  type MonthBookings,
  type MonthCentre,
  type MonthDay,
  type MonthSession,
} from "@/lib/roster/month-bookings-model";

type TypeFilter = "all" | "school" | "childcare_centre";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  pending_confirmation: "Waiting on coach",
  confirmed: "Confirmed",
  in_progress: "Running",
  completed: "Done",
  cancelled: "Cancelled",
  needs_replacement: "Needs replacement",
};

function monthLabel(month: string) {
  return new Date(`${month}-15T12:00:00+10:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: SYDNEY_TZ });
}

function dateLabel(iso: string) {
  return new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: SYDNEY_TZ });
}

function time12(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

function hours(minutes: number) {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

function money(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

function mondayOf(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (wd - 1));
  return d.toISOString().slice(0, 10);
}

function typeLabel(type: string) {
  return type === "school" ? "School" : "Centre";
}

export function MonthBookingsView({
  bookings,
  financialAccess,
  thisMonth,
  basePath,
  pagePath,
}: {
  bookings: MonthBookings;
  financialAccess: boolean;
  thisMonth: string;
  /** The roster ("/admin/roster" or "/ops/roster") — dates link into it. */
  basePath: string;
  /** This page ("/admin/monthly-bookings" or "/ops/monthly-bookings"). */
  pagePath: string;
}) {
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Filtering re-runs the pure model over the chosen centres, so every
  // number on the page (tiles, calendar, rows) describes the same set.
  const view = useMemo(() => {
    if (filter === "all") return bookings;
    const keep = (c: MonthCentre) => (filter === "school" ? c.type === "school" : c.type !== "school");
    // A fully cancelled centre is in both lists — dedupe by id.
    const all = new Map([...bookings.rows.map((r) => r.centre), ...bookings.not_booked].map((c) => [c.id, c]));
    const centres = [...all.values()].filter(keep);
    const sessions = bookings.rows.filter((r) => keep(r.centre)).flatMap((r) => r.sessions);
    return buildMonthBookings(bookings.month, centres, sessions);
  }, [bookings, filter]);

  const centreById = useMemo(() => new Map(bookings.rows.map((r) => [r.centre.id, r.centre])), [bookings.rows]);
  const t = view.totals;
  const month = bookings.month;
  const href = (m: string) => `${pagePath}?month=${m}`;

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {/* Header + month navigation */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <CalendarDays className="size-6 text-primary" /> Monthly bookings
          </h1>
          <p className="text-sm text-muted-foreground">Which schools and centres are booked in, and what they&apos;ve booked.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" className="size-11" nativeButton={false} render={<Link href={href(shiftMonth(month, -1))} aria-label="Previous month" />}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 text-center text-base font-semibold text-foreground">{monthLabel(month)}</span>
          <Button variant="outline" size="icon" className="size-11" nativeButton={false} render={<Link href={href(shiftMonth(month, 1))} aria-label="Next month" />}>
            <ChevronRight className="size-4" />
          </Button>
          {month !== thisMonth && (
            <Button variant="ghost" className="min-h-11" nativeButton={false} render={<Link href={href(thisMonth)} />}>
              This month
            </Button>
          )}
        </div>
      </div>

      {/* Schools / centres filter */}
      <div className="inline-flex rounded-lg border p-1" role="tablist" aria-label="Show">
        {(
          [
            ["all", "All"],
            ["school", "Schools"],
            ["childcare_centre", "Centres"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${
              filter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Sessions booked" value={t.booked} hint={t.trials ? `incl. ${t.trials} trial${t.trials === 1 ? "" : "s"}` : undefined} strong />
        <Stat label="Booked in" value={t.schools + t.centres} hint={`${t.schools} school${t.schools === 1 ? "" : "s"} · ${t.centres} centre${t.centres === 1 ? "" : "s"}`} />
        <Stat label="Coaching hours" value={hours(t.minutes)} />
        <Stat label="Need a coach" value={t.no_coach} tone={t.no_coach ? "red" : undefined} />
        <Stat label="Confirmed" value={`${t.confirmed} / ${t.booked}`} hint={t.unconfirmed ? `${t.unconfirmed} waiting on coach` : undefined} />
        {financialAccess ? (
          <Stat
            label="Booked value"
            value={money(t.value)}
            hint={t.unpriced ? `${t.unpriced} session${t.unpriced === 1 ? "" : "s"} have no rate set` : t.cancelled ? `${t.cancelled} cancelled, not counted` : undefined}
          />
        ) : (
          <div className="flex items-center gap-2 rounded-xl border p-3 text-xs text-muted-foreground">
            <Lock className="size-4" /> Value hidden — needs financial access
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="overflow-hidden rounded-xl border">
        <div className="grid grid-cols-7 bg-muted/30 text-center text-xs font-medium text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1 py-2">
              {d}
            </div>
          ))}
        </div>
        {view.weeks.map((week, i) => (
          <div key={i} className="grid grid-cols-7 border-t">
            {week.map((day, j) => (
              <CalendarCell key={day?.date ?? `blank-${i}-${j}`} day={day} centreById={centreById} basePath={basePath} />
            ))}
          </div>
        ))}
      </div>

      {/* Per school / centre */}
      <div>
        <h2 className="mb-2 text-lg font-semibold text-foreground">By school &amp; centre</h2>
        {view.rows.length === 0 ? (
          <p className="rounded-xl border px-4 py-8 text-center text-sm text-muted-foreground">Nothing booked for {monthLabel(month)}.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2">School / centre</th>
                  <th className="px-3 py-2 text-right">Sessions</th>
                  <th className="px-3 py-2">Days</th>
                  <th className="px-3 py-2">Sports</th>
                  <th className="px-3 py-2">Times</th>
                  <th className="px-3 py-2 text-right">Hours</th>
                  <th className="px-3 py-2">Coaches</th>
                  {financialAccess && <th className="px-3 py-2 text-right">Value</th>}
                  <th className="w-10 px-3 py-2" aria-label="Expand" />
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <Fragment key={row.centre.id}>
                    <CentreRow row={row} financialAccess={financialAccess} expanded={open.has(row.centre.id)} onToggle={() => toggle(row.centre.id)} />
                    {open.has(row.centre.id) && (
                      <tr className="border-t bg-muted/10">
                        <td colSpan={financialAccess ? 9 : 8} className="px-3 py-2">
                          <SessionList sessions={row.sessions} centreId={row.centre.id} basePath={basePath} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gaps */}
      {view.not_booked.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 shrink-0" />
            {view.not_booked.length} active {view.not_booked.length === 1 ? "client has" : "clients have"} nothing booked in {monthLabel(month)}
          </p>
          <p className="mt-1 text-amber-800">{view.not_booked.map((c) => `${c.name} (${typeLabel(c.type)})`).join(" · ")}</p>
        </div>
      )}
    </div>
  );
}

function CalendarCell({ day, centreById, basePath }: { day: MonthDay | null; centreById: Map<string, MonthCentre>; basePath: string }) {
  if (!day) return <div className="min-h-16 bg-muted/10 sm:min-h-24" />;
  const count = day.sessions.length;
  const shown = day.centre_ids.slice(0, 3);
  const more = day.centre_ids.length - shown.length;
  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-xs font-medium text-foreground">{Number(day.date.slice(8))}</span>
        {count > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold tabular-nums text-primary">{count}</span>}
      </div>
      {/* Centre names on wider screens; dots alone on a phone. */}
      <div className="mt-1 hidden space-y-0.5 sm:block">
        {shown.map((id) => {
          const c = centreById.get(id);
          return (
            <div key={id} className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c?.colour }} />
              <span className="truncate">{c?.name ?? "Unknown"}</span>
            </div>
          );
        })}
        {more > 0 && <div className="text-[11px] text-muted-foreground">+{more} more</div>}
      </div>
      <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
        {day.centre_ids.slice(0, 6).map((id) => (
          <span key={id} className="size-2 rounded-full" style={{ backgroundColor: centreById.get(id)?.colour }} />
        ))}
      </div>
    </>
  );
  const title = count
    ? `${dateLabel(day.date)}: ${count} session${count === 1 ? "" : "s"} — ${day.centre_ids.map((id) => centreById.get(id)?.name).join(", ")}`
    : `${dateLabel(day.date)}: nothing booked`;
  return count ? (
    <Link href={`${basePath}?week=${mondayOf(day.date)}`} title={title} className="block min-h-16 border-l p-1.5 first:border-l-0 hover:bg-muted/30 sm:min-h-24">
      {inner}
    </Link>
  ) : (
    <div title={title} className="min-h-16 border-l p-1.5 first:border-l-0 sm:min-h-24">
      {inner}
    </div>
  );
}

function CentreRow({ row, financialAccess, expanded, onToggle }: { row: CentreMonth; financialAccess: boolean; expanded: boolean; onToggle: () => void }) {
  return (
    <tr className="cursor-pointer border-t hover:bg-muted/20" onClick={onToggle}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.centre.colour }} />
          <span className="font-medium text-foreground">{row.centre.name}</span>
          <span className="rounded-full border px-1.5 text-[11px] text-muted-foreground">{typeLabel(row.centre.type)}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <span className="font-semibold text-foreground">{row.booked}</span>
        {row.cancelled > 0 && <span className="block text-[11px] text-muted-foreground">{row.cancelled} cancelled</span>}
        {row.trials > 0 && <span className="block text-[11px] text-muted-foreground">{row.trials} trial</span>}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{row.weekdays.map((d) => WEEKDAYS[d - 1]).join(", ") || "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{row.sports.join(", ") || "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{row.times.map(time12).join(", ") || "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{hours(row.minutes)}</td>
      <td className="px-3 py-2">
        {row.booked === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : row.no_coach > 0 ? (
          <span className="text-red-700">{row.no_coach} need a coach</span>
        ) : row.unconfirmed > 0 ? (
          <span className="text-sky-700">{row.unconfirmed} waiting on coach</span>
        ) : row.confirmed === row.booked ? (
          <span className="text-emerald-700">All confirmed</span>
        ) : (
          <span className="text-amber-700">{row.booked - row.confirmed} not published</span>
        )}
      </td>
      {financialAccess && (
        <td className="px-3 py-2 text-right tabular-nums">{row.value == null ? <span className="text-xs text-muted-foreground">No rate</span> : money(row.value)}</td>
      )}
      <td className="px-3 py-2 text-muted-foreground">
        <button
          type="button"
          aria-label={expanded ? `Hide ${row.centre.name} sessions` : `Show ${row.centre.name} sessions`}
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </td>
    </tr>
  );
}

function SessionList({ sessions, centreId, basePath }: { sessions: MonthSession[]; centreId: string; basePath: string }) {
  return (
    <ul className="divide-y text-sm">
      {sessions.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
          <Link href={`${basePath}?week=${mondayOf(s.date)}&centre=${centreId}`} className="w-32 font-medium text-foreground hover:underline">
            {dateLabel(s.date)}
          </Link>
          <span className="w-28 text-muted-foreground">
            {time12(s.time)} · {s.duration_minutes}m
          </span>
          <span className="w-28 text-foreground">{s.sport || "—"}</span>
          <span className={`w-36 ${s.coach_count === 0 ? "text-red-700" : "text-muted-foreground"}`}>
            {s.coach_count === 0 ? "No coach" : `${s.coach_name ?? "Coach"}${s.coach_count > 1 ? ` +${s.coach_count - 1}` : ""}`}
          </span>
          <span className={s.status === "cancelled" ? "text-muted-foreground line-through" : "text-muted-foreground"}>
            {STATUS_LABEL[s.status] ?? s.status}
            {s.is_trial ? " · Trial" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, hint, strong, tone }: { label: string; value: string | number; hint?: string; strong?: boolean; tone?: "red" }) {
  return (
    <div className={`rounded-xl border p-3 ${strong ? "border-primary/40 bg-primary/5" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${tone === "red" ? "text-red-700" : "text-foreground"}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
