"use client";

// The school's approved PDHPE term plan drives the roster: for each
// class with an approved plan, write every upcoming session's programme
// from the plan's week. One generation per request (each takes a minute
// or more), walked here so ops see progress and one failure costs one
// session.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPlanRosterPreview, type PlanRosterPlan, type PlanRosterSession } from "@/lib/programs/plan-roster-actions";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";

interface PlanProgrammeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  termId: string;
  termName: string;
  onSuccess: () => void;
}

type RowResult = { ok: true; title: string; reused: boolean } | { ok: false; error: string };

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00+10:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: SYDNEY_TZ,
  });
}

const STATE_LABEL: Record<PlanRosterSession["state"], string> = {
  ready: "No programme yet",
  from_plan: "Written from the plan",
  programmed: "Has another programme",
  locked: "Completed or cancelled",
  no_week: "Outside the plan's weeks",
};

export function PlanProgrammeDialog({ open, onOpenChange, termId, termName, onSuccess }: PlanProgrammeDialogProps) {
  const [plans, setPlans] = useState<PlanRosterPlan[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [replace, setReplace] = useState(false);
  // A run is scoped to what is on screen: one school, or all of them.
  const [centreId, setCentreId] = useState<string>("all");
  const [running, setRunning] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, RowResult>>({});
  const stopRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setPlans(null);
      setResults({});
      setReplace(false);
      setCentreId("all");
      return;
    }
    let cancelled = false;
    setLoading(true);
    getPlanRosterPreview({ termId }).then(({ data, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error || !data) {
        toast.error(error ?? "Failed to load the term plans.");
        return;
      }
      setPlans(data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, termId]);

  const schools = Array.from(new Map((plans ?? []).map((p) => [p.centreId, p.centreName])).entries());
  const visiblePlans = (plans ?? []).filter((p) => centreId === "all" || p.centreId === centreId);
  const targets = visiblePlans.flatMap((p) =>
    p.sessions
      .filter((s) => (s.state === "ready" || (replace && s.state === "programmed")) && !results[s.id]?.ok)
      .map((s) => ({ planId: p.planId, session: s }))
  );

  async function handleRun() {
    stopRef.current = false;
    setRunning(true);
    let written = 0;
    let failed = 0;
    for (const t of targets) {
      if (stopRef.current) break;
      setCurrentId(t.session.id);
      try {
        const res = await fetch("/api/ai/generate-plan-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId: t.planId,
            sessionId: t.session.id,
            replace: t.session.state === "programmed",
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | { data?: { title: string; reused: boolean }; error?: string }
          | null;
        if (!res.ok || !json?.data) {
          failed++;
          const error = json?.error ?? "Failed to write the programme.";
          setResults((r) => ({ ...r, [t.session.id]: { ok: false, error } }));
          // A daily cap or an outage will fail every remaining session too.
          if (res.status === 429 || res.status === 401 || res.status === 403) break;
        } else {
          written++;
          const { title, reused } = json.data;
          setResults((r) => ({ ...r, [t.session.id]: { ok: true, title, reused } }));
        }
      } catch {
        failed++;
        setResults((r) => ({ ...r, [t.session.id]: { ok: false, error: "Network error." } }));
      }
    }
    setCurrentId(null);
    setRunning(false);
    if (written > 0) {
      toast.success(`${written} session${written === 1 ? "" : "s"} programmed from the school's plan.`);
      onSuccess();
    }
    if (failed > 0) toast.error(`${failed} session${failed === 1 ? "" : "s"} could not be programmed.`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Programme from school plans — {termName}</DialogTitle>
          <DialogDescription>
            Each class with an approved PDHPE term plan gets its sessions written from the plan: that week&apos;s
            focus, the unit and its syllabus outcomes. Completed and cancelled sessions are never touched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : plans && plans.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No school has an approved PDHPE term plan for this term yet. A plan is drafted and approved in the
              school&apos;s portal under Curriculum.
            </p>
          ) : plans ? (
            <>
              {schools.length > 1 && (
                <Select value={centreId} onValueChange={(v) => setCentreId(v ?? "all")} disabled={running}>
                  <SelectTrigger aria-label="School">
                    <SelectValue placeholder="All schools" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All schools</SelectItem>
                    {schools.map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {visiblePlans.map((p) => (
                <section key={p.planId} className="rounded-lg border">
                  <header className="border-b bg-muted/30 px-3 py-2">
                    <p className="text-sm font-medium text-foreground">
                      {p.className}
                      <span className="font-normal text-muted-foreground"> · {p.centreName}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{p.planTitle}</p>
                  </header>
                  {p.sessions.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                      No sessions are rostered for this class this term.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {p.sessions.map((s) => {
                        const result = results[s.id];
                        const isTarget = s.state === "ready" || (replace && s.state === "programmed");
                        return (
                          <li key={s.id} className={`px-3 py-2 text-sm ${isTarget || result ? "" : "opacity-60"}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-foreground">
                                  <span className="font-medium">{s.week ? `Week ${s.week}` : "—"}</span>{" "}
                                  <span className="text-muted-foreground">
                                    · {formatDate(s.date)} · {s.sport}
                                  </span>
                                  {s.sharedWith.length > 0 && (
                                    <>
                                      {" "}
                                      <Badge variant="outline" className="text-[10px]">
                                        with {s.sharedWith.join(", ")}
                                      </Badge>
                                    </>
                                  )}
                                </p>
                                {s.focus && <p className="mt-0.5 text-xs text-muted-foreground">{s.focus}</p>}
                                {result?.ok && (
                                  <p className="mt-0.5 text-xs text-emerald-700">
                                    {result.title}
                                    {result.reused ? " (shared with this week's other session)" : ""}
                                  </p>
                                )}
                                {result && !result.ok && (
                                  <p className="mt-0.5 flex items-center gap-1 text-xs text-red-700">
                                    <AlertTriangle className="size-3" />
                                    {result.error}
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {currentId === s.id ? (
                                  <span className="inline-flex items-center gap-1 text-foreground">
                                    <Loader2 className="size-3 animate-spin" />
                                    Writing…
                                  </span>
                                ) : result?.ok ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700">
                                    <CheckCircle2 className="size-3" />
                                    Programmed
                                  </span>
                                ) : (
                                  STATE_LABEL[s.state]
                                )}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ))}

              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={replace}
                  disabled={running}
                  onCheckedChange={(v) => setReplace(v === true)}
                />
                Also replace programmes already attached to upcoming sessions
              </label>
              <p className="text-xs text-muted-foreground">
                Each programme takes about a minute to write. Keep this window open while it runs.
              </p>
            </>
          ) : null}
        </div>

        <DialogFooter>
          {running ? (
            <Button variant="outline" onClick={() => (stopRef.current = true)}>
              Stop after this session
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          <Button disabled={running || loading || targets.length === 0} onClick={handleRun}>
            {running ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <ClipboardList className="mr-1.5 size-4" />}
            Programme {targets.length} session{targets.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
