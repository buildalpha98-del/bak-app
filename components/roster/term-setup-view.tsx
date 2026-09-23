"use client";

// Set up a term in two steps: roll last term's weekly pattern forward
// as templates (tick what still runs, fix what looks wrong), then
// generate every week of the term at once. Both steps are safe to
// repeat — nothing is doubled up.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CalendarPlus, CheckCircle2, Loader2, Repeat } from "lucide-react";
import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyTermSetup, generateSessionsForTerm, type TermSetupData } from "@/lib/terms/setup-actions";
import { defaultSelected, type InferredEntry } from "@/lib/terms/term-setup";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FLAG_TEXT: Record<InferredEntry["flags"][number], string> = {
  odd_time: "Unusual time — a typo last term?",
  weekend: "Weekend — add by hand in the template builder",
  long: "All-day block, not a weekly slot",
};
const NONE = "__none__";

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: SYDNEY_TZ });
}

export function TermSetupView({ data, basePath }: { data: TermSetupData; basePath: string }) {
  const router = useRouter();
  const { term, source, entries, coaches, holidays } = data;

  // Step 1 state: which slots, with editable time and coach.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(entries.filter(defaultSelected).map((e) => e.key)));
  const [times, setTimes] = useState<Record<string, string>>({});
  const [coachOf, setCoachOf] = useState<Record<string, string | null>>({});
  const [keepCoaches, setKeepCoaches] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ created: number; skipped: number } | null>(null);

  // Step 2 state: skip dates and generation.
  const [skip, setSkip] = useState<Set<string>>(() => new Set(holidays.map((h) => h.date)));
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<{ created: number; weeks: number } | null>(null);

  const byCentre = useMemo(() => {
    const m = new Map<string, InferredEntry[]>();
    for (const e of entries) m.set(e.centre_name, [...(m.get(e.centre_name) ?? []), e]);
    return [...m.entries()];
  }, [entries]);
  const templatesReady = data.existingTemplates + (applied?.created ?? 0);

  function toggle(key: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function handleApply() {
    setApplying(true);
    const chosen = entries
      .filter((e) => selected.has(e.key))
      .map((e) => ({
        centre_id: e.centre_id,
        day_of_week: e.day_of_week,
        time: times[e.key] ?? e.time,
        duration_minutes: e.duration_minutes,
        sport: e.sport,
        coach_id: keepCoaches ? (e.key in coachOf ? coachOf[e.key] : e.coach_id) : null,
        school_class_ids: e.school_class_ids,
      }));
    const { data: res, error } = await applyTermSetup(term.id, chosen);
    setApplying(false);
    if (error || !res) {
      toast.error(error ?? "Failed to save the templates.");
      return;
    }
    setApplied(res);
    toast.success(`${res.created} slot${res.created === 1 ? "" : "s"} added to ${term.name}${res.skipped ? ` (${res.skipped} already there)` : ""}.`);
    router.refresh();
  }

  async function handleGenerate() {
    setGenerating(true);
    const { data: res, error } = await generateSessionsForTerm({ termId: term.id, skipDates: [...skip] });
    setGenerating(false);
    if (error || !res) {
      toast.error(error ?? "Failed to generate the term.");
      return;
    }
    setGenerated({ created: res.created, weeks: res.weeks });
    toast.success(`${res.created} session${res.created === 1 ? "" : "s"} created across ${res.weeks} week${res.weeks === 1 ? "" : "s"}.`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${basePath}/terms`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Terms
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Set up {term.name}</h1>
        <p className="text-sm text-muted-foreground">
          {fmtDate(term.start_date)} – {fmtDate(term.end_date)} · {templatesReady} template slot{templatesReady === 1 ? "" : "s"} ·{" "}
          {data.existingSessions} session{data.existingSessions === 1 ? "" : "s"} so far
        </p>
      </div>

      {/* ---------------- Step 1: roll forward ---------------- */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Repeat className="size-5 text-primary" /> 1. Roll last term forward
              </h2>
              <p className="text-sm text-muted-foreground">
                {source
                  ? `The weekly pattern read from ${source.name} (${source.sessions} sessions, ${fmtDate(source.start_date)} – ${fmtDate(source.end_date)}). Tick what still runs; fix a time or coach where it changed.`
                  : "No earlier term has any sessions to read a pattern from — build this term's slots in the template builder instead."}
              </p>
            </div>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${basePath}/terms/${term.id}/template`} />}>
              Template builder
            </Button>
          </div>

          {entries.length > 0 && (
            <>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <Checkbox checked={keepCoaches} onCheckedChange={(v) => setKeepCoaches(v === true)} />
                Keep each slot&apos;s usual coach as its default
              </label>

              <div className="space-y-4">
                {byCentre.map(([centre, rows]) => (
                  <section key={centre} className="rounded-lg border">
                    <header className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
                      <p className="text-sm font-medium text-foreground">{centre}</p>
                      <span className="text-xs text-muted-foreground">
                        {rows.filter((r) => selected.has(r.key)).length} of {rows.length} slots
                      </span>
                    </header>
                    <ul className="divide-y">
                      {rows.map((e) => {
                        const on = selected.has(e.key);
                        const disabled = e.flags.includes("weekend");
                        return (
                          <li key={e.key} className={`px-3 py-2 text-sm ${on ? "" : "opacity-70"}`}>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                              <label className="flex min-h-9 items-center gap-2">
                                <Checkbox checked={on} disabled={disabled} onCheckedChange={(v) => toggle(e.key, v === true)} aria-label={`${centre} ${DAY[e.day_of_week]} ${e.time} ${e.sport}`} />
                                <span className="w-9 font-medium text-foreground">{DAY[e.day_of_week]}</span>
                              </label>
                              <input
                                type="time"
                                value={times[e.key] ?? e.time}
                                onChange={(ev) => setTimes((t) => ({ ...t, [e.key]: ev.target.value }))}
                                aria-label={`${centre} ${DAY[e.day_of_week]} time`}
                                className="h-9 rounded-md border bg-background px-2 text-sm"
                              />
                              <span className="text-muted-foreground">{e.duration_minutes} min</span>
                              <span className="font-medium text-foreground">{e.sport}</span>
                              {keepCoaches && (
                                <Select
                                  value={(e.key in coachOf ? coachOf[e.key] : e.coach_id) ?? NONE}
                                  onValueChange={(v) => setCoachOf((c) => ({ ...c, [e.key]: v === NONE || v === null ? null : v }))}
                                >
                                  <SelectTrigger className="h-9 w-40" aria-label={`${centre} ${DAY[e.day_of_week]} coach`}>
                                    <SelectValue placeholder="No coach" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={NONE}>No coach yet</SelectItem>
                                    {coaches.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              <Badge variant={e.confidence === "regular" ? "secondary" : "outline"} className="text-[10px]">
                                {e.weeks_seen} of {e.weeks_in_term} weeks
                              </Badge>
                              {e.school_class_ids && e.school_class_ids.length > 0 && (
                                <Badge variant="outline" className="text-[10px]">
                                  {e.school_class_ids.length} class{e.school_class_ids.length === 1 ? "" : "es"}
                                </Badge>
                              )}
                            </div>
                            {e.flags.length > 0 && (
                              <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                                <AlertTriangle className="size-3" /> {e.flags.map((f) => FLAG_TEXT[f]).join(" · ")}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {selected.size} slot{selected.size === 1 ? "" : "s"} selected
                  {applied && (
                    <span className="ml-2 inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="size-4" /> {applied.created} added
                    </span>
                  )}
                </p>
                <Button onClick={handleApply} disabled={applying || selected.size === 0} className="min-h-11">
                  {applying && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                  Add {selected.size} slot{selected.size === 1 ? "" : "s"} to {term.name}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------------- Step 2: generate ---------------- */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CalendarPlus className="size-5 text-primary" /> 2. Generate the whole term
          </h2>
          <p className="text-sm text-muted-foreground">
            One draft session per slot per week, from {fmtDate(term.start_date)} to {fmtDate(term.end_date)}. Weeks already generated are
            skipped, so this is safe to run again after adding slots.
          </p>
          {holidays.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Skip these dates</p>
              {holidays.map((h) => (
                <label key={h.date} className="flex min-h-9 items-center gap-2 text-sm">
                  <Checkbox
                    checked={skip.has(h.date)}
                    onCheckedChange={(v) =>
                      setSkip((prev) => {
                        const next = new Set(prev);
                        if (v === true) next.add(h.date);
                        else next.delete(h.date);
                        return next;
                      })
                    }
                  />
                  {h.name} · {fmtDate(h.date)}
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {templatesReady === 0
                ? "Add slots first."
                : generated
                  ? `${generated.created} sessions created across ${generated.weeks} weeks.`
                  : `${templatesReady} slot${templatesReady === 1 ? "" : "s"} ready.`}
            </p>
            <Button onClick={handleGenerate} disabled={generating || templatesReady === 0} className="min-h-11">
              {generating && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Generate {term.name}
            </Button>
          </div>
          {generated && (
            <p className="text-sm">
              <Link href={`${basePath}/coverage?term=${term.id}`} className="font-medium text-primary hover:underline">
                Open the term board
              </Link>{" "}
              to assign coaches, publish and programme it.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
