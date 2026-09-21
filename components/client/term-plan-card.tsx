"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, CheckCircle2, Dumbbell, Trash2, PenLine, Pencil } from "lucide-react";
import { toast } from "sonner";
import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SUBJECTS, subjectOf } from "@/lib/curriculum/subjects";
import { yearGroupLabel } from "@/lib/schools/year-groups";
import { setTermPlanStatus, deleteTermPlan, type PlanCoachSession, type SchoolTermPlan, type TermPlanTerm } from "@/lib/client/term-plan-actions";
import type { TermPlanJson } from "@/lib/curriculum/term-plan";
import { coachUnitForWeek } from "@/lib/curriculum/plan-roster";
import { TermPlanEditor } from "@/components/client/term-plan-editor";

/** The units of a plan, each week linking into the lesson generator. */
export function TermPlanUnits({
  plan,
  centreId,
  classId,
  subject,
  term,
  coachSessions = [],
}: {
  /** Coach sessions written from this plan (migration 098). */
  coachSessions?: PlanCoachSession[];
  plan: TermPlanJson;
  centreId: string;
  classId: string | null;
  subject: string;
  term: TermPlanTerm | null;
}) {
  const lessonSubjects = ["english", "mathematics"];
  const lessonHref = (week: number, focus: string) => {
    const p = new URLSearchParams();
    p.set("subject", subject);
    if (classId) p.set("classId", classId);
    const weekStart = term?.weekStarts[week - 1];
    if (weekStart) p.set("week", weekStart);
    p.set("learningFocus", focus.slice(0, 200));
    const strand = plan.units.find((u) => u.weeks.includes(week))?.strand ?? "";
    if (strand && subjectOf(subject).strandOptions.includes(strand)) p.set("focus", strand);
    return `/client/${centreId}/programs/generate?${p.toString()}`;
  };
  return (
    <ol className="space-y-3">
      {plan.units.map((u, i) => (
        <li key={i} className="rounded-2xl border border-portal-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-foreground">{u.title}</h3>
              <p className="text-xs text-muted-foreground">
                {u.strand && <span>{u.strand} · </span>}
                Week{u.weeks.length > 1 ? "s" : ""} {u.weeks[0]}
                {u.weeks.length > 1 ? `–${u.weeks[u.weeks.length - 1]}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {u.outcomes.map((o) => (
                <Badge key={o.code} variant="outline" className="border-portal-200 text-portal-800" title={o.title}>
                  {o.code}
                </Badge>
              ))}
            </div>
          </div>
          {u.description && <p className="mt-2 text-sm text-foreground">{u.description}</p>}
          {u.inquiryQuestions && u.inquiryQuestions.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Key inquiry: {u.inquiryQuestions.join(" · ")}</p>
          )}
          {u.assessment && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium">Assessment:</span> {u.assessment}</p>}
          <ul className="mt-3 divide-y divide-portal-100 rounded-xl border border-portal-100">
            {u.weeklyFocus.map((w) => (
              <li key={w.week} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="mr-2 font-medium text-portal-800">Wk {w.week}</span>{" "}
                  {w.focus}
                  {coachUnitForWeek(plan, w.week) === u &&
                    coachSessions
                      .filter((c) => c.week === w.week)
                      .map((c) => (
                        <Link
                          key={c.session_id}
                          href={`/client/${centreId}/schedule/${c.session_id}`}
                          className="mt-1 flex min-h-[36px] items-center gap-1 text-xs font-medium text-portal-700 hover:underline"
                        >
                          <Dumbbell className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            Coach session:{" "}
                            {c.program_title}
                          </span>
                        </Link>
                      ))}
                </div>
                {lessonSubjects.includes(subject) && (
                  <Link href={lessonHref(w.week, w.focus)} className="inline-flex min-h-[36px] shrink-0 items-center gap-1 text-xs font-medium text-portal-700 hover:underline">
                    <PenLine className="h-3.5 w-3.5" /> Write lesson
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** A saved plan on the Scope & Sequence page: collapsed by default. */
export function TermPlanCard({
  plan,
  centreId,
  term,
  canApprove,
}: {
  plan: SchoolTermPlan;
  centreId: string;
  term: TermPlanTerm | null;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();

  function approve(next: "draft" | "approved") {
    startTransition(async () => {
      const { error } = await setTermPlanStatus(centreId, plan.id, next);
      if (error) toast.error(error);
      else {
        toast.success(next === "approved" ? "Plan approved — it is now the programme of record." : "Approval withdrawn.");
        router.refresh();
      }
    });
  }
  function remove() {
    if (!window.confirm(`Delete the ${SUBJECTS[plan.subject as keyof typeof SUBJECTS]?.label ?? plan.subject} plan for ${plan.class_name}?`)) return;
    startTransition(async () => {
      const { error } = await deleteTermPlan(centreId, plan.id);
      if (error) toast.error(error);
      else {
        toast.success("Plan deleted.");
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-2xl border border-portal-200 bg-portal-50/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold text-foreground">{plan.title}</span>
          <span className="block text-xs text-muted-foreground">
            {plan.class_name} · {yearGroupLabel(plan.year_group)} · {subjectOf(plan.subject).label} · {plan.plan.units.length} units
            {plan.author_name ? ` · ${plan.author_name}` : ""}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {plan.status === "approved" ? (
            <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">Approved</Badge>
          ) : (
            <Badge variant="outline">Draft</Badge>
          )}
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {open && editing && (
        <div className="px-4 pb-4">
          <TermPlanEditor
            centreId={centreId}
            planId={plan.id}
            initial={plan.plan}
            wasApproved={plan.status === "approved"}
            weekCount={term?.weekCount ?? plan.plan.weekCount}
            strandOptions={subjectOf(plan.subject).strandOptions}
            outcomeOptions={plan.outcome_options}
            onDone={() => {
              setEditing(false);
              router.refresh();
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
      {open && !editing && (
        <div className="space-y-4 px-4 pb-4">
          {plan.plan.rationale && <p className="text-sm text-muted-foreground">{plan.plan.rationale}</p>}
          <TermPlanUnits coachSessions={plan.coach_sessions} plan={plan.plan} centreId={centreId} classId={plan.class_id} subject={plan.subject} term={term} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="min-h-[40px]">
              <Pencil className="mr-1.5 h-4 w-4" /> Edit plan
            </Button>
            {canApprove && plan.status !== "approved" && (
              <Button size="sm" onClick={() => approve("approved")} className="min-h-[40px]">
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
              </Button>
            )}
            {canApprove && plan.status === "approved" && (
              <Button size="sm" variant="outline" onClick={() => approve("draft")} className="min-h-[40px]">
                Withdraw approval
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={remove} className="min-h-[40px] text-destructive">
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
