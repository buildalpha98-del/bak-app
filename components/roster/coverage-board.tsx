"use client";

// The term board: every centre against every week. Each cell is the
// week's state (nothing / no coach / draft / unconfirmed / ready) with
// a dot when it's programmed; clicking opens that centre's week on the
// roster. Gaps sort to the top.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, BellRing, CalendarRange, Loader2, Send, Sparkles, Wand2 } from "lucide-react";
import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CoverageBoard as Board, CellState, CoverageCell } from "@/lib/roster/coverage-model";
import type { CoverageTermOption } from "@/lib/roster/coverage-actions";
import { termTiming } from "@/lib/schools/plannable-terms";
import { getUnconfirmedByCoach, publishTerm, remindUnconfirmed, type UnconfirmedByCoach } from "@/lib/roster/term-actions";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";

const STATE: Record<CellState, { label: string; cls: string }> = {
  none: { label: "Nothing rostered", cls: "bg-muted/40 text-muted-foreground" },
  unassigned: { label: "No coach", cls: "bg-red-100 text-red-800 border-red-200" },
  draft: { label: "Not published", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  unconfirmed: { label: "Waiting on coach", cls: "bg-sky-100 text-sky-800 border-sky-200" },
  ready: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground line-through" },
};

function weekLabel(iso: string) {
  return new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: SYDNEY_TZ });
}

function cellTitle(c: CoverageCell) {
  if (c.total === 0) return "Nothing rostered this week";
  const live = c.total - c.cancelled;
  return `${live} session${live === 1 ? "" : "s"} — ${STATE[c.state].label}; ${c.programmed} of ${live} programmed`;
}

export function CoverageBoardView({
  board,
  term,
  terms,
  today,
  basePath,
}: {
  board: Board;
  term: CoverageTermOption;
  terms: CoverageTermOption[];
  today: string;
  basePath: string;
}) {
  const router = useRouter();
  const t = board.totals;
  const noSessions = t.sessions === 0;
  const future = board.weeks.filter((w) => w >= mondayOfToday(today));

  // ---- Term actions: AI assign every week, publish, chase confirmations.
  const [assigning, setAssigning] = useState<{ done: number; total: number } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [pending, setPending] = useState<UnconfirmedByCoach[]>([]);
  useEffect(() => {
    getUnconfirmedByCoach(term.id).then(({ data }) => setPending(data ?? []));
  }, [term.id, t.unconfirmed]);

  async function handleAssign() {
    // One solver run per week, like the roster's AI Assign, so every
    // run is on the record and a failure costs one week. Only weeks from
    // today, and only sessions with no coach.
    const weeks = future.filter((w) => board.rows.some((r) => r.cells.find((c) => c.week_start === w)?.unassigned));
    if (weeks.length === 0) {
      toast.message("Every session from this week on already has a coach.");
      return;
    }
    setAssigning({ done: 0, total: weeks.length });
    let assigned = 0;
    let left = 0;
    for (const w of weeks) {
      const end = new Date(`${w}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 4);
      try {
        const res = await fetch("/api/scheduling/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekStart: w, weekEnd: end.toISOString().slice(0, 10), termId: term.id, keepExisting: true }),
        });
        const json = (await res.json()) as { summary?: { assigned_count: number; unassigned_count: number }; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed");
        assigned += json.summary?.assigned_count ?? 0;
        left += json.summary?.unassigned_count ?? 0;
      } catch (err) {
        toast.error(`Week of ${weekLabel(w)}: ${err instanceof Error ? err.message : "failed"}`);
      }
      setAssigning((a) => (a ? { ...a, done: a.done + 1 } : a));
    }
    setAssigning(null);
    toast.success(`${assigned} session${assigned === 1 ? "" : "s"} assigned${left ? ` — ${left} still need a coach (no one eligible)` : ""}.`);
    router.refresh();
  }

  async function handlePublish() {
    setPublishing(true);
    const { data, error } = await publishTerm(term.id);
    setPublishing(false);
    if (error || !data) {
      toast.error(error ?? "Failed to publish.");
      return;
    }
    toast.success(
      `${data.sent_to_coaches} shift${data.sent_to_coaches === 1 ? "" : "s"} sent to ${data.coaches_notified} coach${data.coaches_notified === 1 ? "" : "es"} to confirm` +
        (data.published_unassigned ? `; ${data.published_unassigned} with no coach published to centres` : "") +
        "."
    );
    router.refresh();
  }

  async function handleRemind() {
    setReminding(true);
    const { data, error } = await remindUnconfirmed(term.id);
    setReminding(false);
    if (error || !data) toast.error(error ?? "Failed to send reminders.");
    else toast.success(`Reminded ${data.reminded} coach${data.reminded === 1 ? "" : "es"}.`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <CalendarRange className="size-6 text-primary" /> Term board
          </h1>
          <p className="text-sm text-muted-foreground">Every centre, every week — what&apos;s rostered, who&apos;s confirmed, what&apos;s programmed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {terms.length > 1 && (
            <Select value={term.id} onValueChange={(v) => v && router.push(`${basePath}/coverage?term=${v}`)}>
              <SelectTrigger className="min-h-11 w-56" aria-label="Term">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {terms.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name} · {termTiming(x, today)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant={noSessions ? "default" : "outline"} nativeButton={false} render={<Link href={`${basePath}/terms/${term.id}/setup`} />} className="min-h-11">
            <Wand2 className="size-4" /> Set up {term.name}
          </Button>
        </div>
      </div>

      {/* The one number, and the four counts behind it. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Term ready" value={`${t.readiness_percent}%`} hint="confirmed + programmed" strong className="col-span-2 sm:col-span-1" />
        <Stat label="Sessions" value={t.sessions} />
        <Stat label="No coach" value={t.unassigned} tone={t.unassigned ? "red" : undefined} />
        <Stat label="Waiting on coach" value={t.unconfirmed} tone={t.unconfirmed ? "sky" : undefined} />
        <Stat label="Programmed" value={`${t.programmed} / ${t.sessions}`} />
      </div>

      {/* The sequence, left to right: assign → publish → chase. */}
      {!noSessions && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/20 p-3">
          <Button onClick={handleAssign} disabled={!!assigning || t.unassigned === 0} variant={t.unassigned > 0 ? "default" : "outline"} className="min-h-11">
            {assigning ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {assigning ? `Assigning week ${assigning.done + 1} of ${assigning.total}…` : `AI assign ${t.unassigned} unassigned`}
          </Button>
          <Button onClick={handlePublish} disabled={publishing || t.drafts_total === 0} variant={t.unassigned === 0 && t.drafts_total > 0 ? "default" : "outline"} className="min-h-11">
            {publishing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Publish {t.drafts_total} draft{t.drafts_total === 1 ? "" : "s"} to coaches
          </Button>
          <Button onClick={handleRemind} disabled={reminding || pending.length === 0} variant="outline" className="min-h-11">
            {reminding ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
            Remind {pending.length} coach{pending.length === 1 ? "" : "es"} to confirm
          </Button>
          {pending.length > 0 && (
            <p className="basis-full text-xs text-muted-foreground">
              Waiting on:{" "}
              {pending.map((p) => `${p.name} (${p.count}, first ${weekLabel(p.first_date)})`).join(" · ")}
            </p>
          )}
        </div>
      )}

      {t.centres_missing > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="size-4 shrink-0" />
          {t.centres_missing} centre{t.centres_missing === 1 ? "" : "s"} ran last term and {t.centres_missing === 1 ? "has" : "have"} nothing rostered for {term.name} — listed first below.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/30">
              <th className="sticky left-0 z-10 bg-muted/30 px-3 py-2 text-left font-medium text-foreground">Centre</th>
              {board.weeks.map((w, i) => (
                <th key={w} className="px-1 py-2 text-center text-xs font-medium text-muted-foreground">
                  <span className="block">Wk {i + 1}</span>
                  <span className="block font-normal">{weekLabel(w)}</span>
                </th>
              ))}
              <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <tr key={row.centre.id} className={`border-t ${row.missing ? "bg-amber-50/60" : ""}`}>
                <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium text-foreground">
                  <span className="block truncate" title={row.centre.name}>
                    {row.centre.name}
                  </span>
                  {row.missing && <span className="block text-[11px] font-normal text-amber-700">Ran last term — nothing yet</span>}
                </td>
                {row.cells.map((c) => (
                  <td key={c.week_start} className="px-1 py-1 text-center">
                    <Link
                      href={`${basePath}?week=${c.week_start}&centre=${row.centre.id}`}
                      title={cellTitle(c)}
                      aria-label={`${row.centre.name}, week of ${weekLabel(c.week_start)}: ${cellTitle(c)}`}
                      className={`inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-md border px-1.5 text-xs font-medium ${STATE[c.state].cls}`}
                    >
                      {c.total === 0 ? "·" : c.total - c.cancelled}
                      {c.programmed > 0 && c.programmed === c.total - c.cancelled && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
                    </Link>
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{row.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(["unassigned", "draft", "unconfirmed", "ready"] as CellState[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-3 rounded-sm border ${STATE[k].cls}`} /> {STATE[k].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-1.5 rounded-full bg-foreground" /> every session programmed
        </span>
      </p>
    </div>
  );
}

function mondayOfToday(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

function Stat({ label, value, hint, strong, tone, className = "" }: { label: string; value: string | number; hint?: string; strong?: boolean; tone?: "red" | "sky"; className?: string }) {
  const toneCls = tone === "red" ? "text-red-700" : tone === "sky" ? "text-sky-700" : "text-foreground";
  return (
    <div className={`rounded-xl border p-3 ${strong ? "border-primary/40 bg-primary/5" : ""} ${className}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
