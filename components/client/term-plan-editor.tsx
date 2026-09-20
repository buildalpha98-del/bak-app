"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Save, Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateTermPlan } from "@/lib/client/term-plan-actions";
import type { TermPlanJson, TermPlanUnit } from "@/lib/curriculum/term-plan";
import { structuralIssues, weekRange } from "@/lib/curriculum/term-plan-checks";

// In-place editor for a saved term plan (migration 096). Everything a
// head of department would red-pen: unit titles, strands, weeks,
// descriptions, inquiry questions, outcomes (picked from the band's
// syllabus list, so no code can be typed wrong), assessment and each
// week's focus. Structural problems show live; the server re-validates
// codes before it saves, and any edit returns the plan to draft.

type UnitDraft = Omit<TermPlanUnit, "weeks"> & { from: number; to: number };

function toDrafts(plan: TermPlanJson): UnitDraft[] {
  return plan.units.map((u) => ({
    ...u,
    inquiryQuestions: u.inquiryQuestions ?? [],
    assessment: u.assessment ?? "",
    from: u.weeks[0] ?? 1,
    to: u.weeks[u.weeks.length - 1] ?? 1,
  }));
}

function toUnits(drafts: UnitDraft[], weekCount: number): TermPlanUnit[] {
  return drafts.map((d) => {
    const weeks = weekRange(d.from, d.to, weekCount);
    const weeklyFocus = weeks.map((w) => ({
      week: w,
      focus: d.weeklyFocus.find((f) => f.week === w)?.focus?.trim() || d.title.trim(),
    }));
    const unit: TermPlanUnit = {
      title: d.title.trim(),
      strand: d.strand.trim(),
      weeks,
      description: d.description.trim(),
      outcomes: d.outcomes,
      weeklyFocus,
    };
    const iq = (d.inquiryQuestions ?? []).map((q) => q.trim()).filter(Boolean);
    if (iq.length) unit.inquiryQuestions = iq;
    if (d.assessment?.trim()) unit.assessment = d.assessment.trim();
    return unit;
  });
}

export function TermPlanEditor({
  centreId,
  planId,
  initial,
  wasApproved,
  weekCount,
  strandOptions,
  outcomeOptions,
  onDone,
  onCancel,
}: {
  centreId: string;
  planId: string;
  initial: TermPlanJson;
  wasApproved: boolean;
  weekCount: number;
  strandOptions: readonly string[];
  outcomeOptions: Array<{ code: string; statement: string }>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [rationale, setRationale] = useState(initial.rationale);
  const [units, setUnits] = useState<UnitDraft[]>(() => toDrafts(initial));
  const [serverIssues, setServerIssues] = useState<string[]>([]);
  const [saving, startSaving] = useTransition();

  const built = useMemo(() => toUnits(units, weekCount), [units, weekCount]);
  const issues = useMemo(() => structuralIssues(built, weekCount), [built, weekCount]);
  const canSave = issues.length === 0 && title.trim().length > 0 && !saving;

  function patch(i: number, changes: Partial<UnitDraft>) {
    setUnits((prev) => prev.map((u, n) => (n === i ? { ...u, ...changes } : u)));
  }
  function move(i: number, dir: -1 | 1) {
    setUnits((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addUnit() {
    const last = units[units.length - 1];
    const from = Math.min(weekCount, (last?.to ?? 0) + 1);
    setUnits((prev) => [
      ...prev,
      { title: "New unit", strand: strandOptions[0] ?? "", from, to: weekCount, description: "", inquiryQuestions: [], outcomes: [], assessment: "", weeklyFocus: [] },
    ]);
  }
  function toggleOutcome(i: number, code: string) {
    const opt = outcomeOptions.find((o) => o.code === code);
    if (!opt) return;
    setUnits((prev) =>
      prev.map((u, n) => {
        if (n !== i) return u;
        const has = u.outcomes.some((o) => o.code === code);
        return {
          ...u,
          outcomes: has
            ? u.outcomes.filter((o) => o.code !== code)
            : [...u.outcomes, { framework: initial.subject as TermPlanUnit["outcomes"][number]["framework"], code, title: opt.statement, description: "" }],
        };
      })
    );
  }
  function setFocus(i: number, week: number, focus: string) {
    setUnits((prev) =>
      prev.map((u, n) => {
        if (n !== i) return u;
        const others = u.weeklyFocus.filter((f) => f.week !== week);
        return { ...u, weeklyFocus: [...others, { week, focus }] };
      })
    );
  }

  function save() {
    if (!canSave) return;
    setServerIssues([]);
    startSaving(async () => {
      const plan: TermPlanJson = { ...initial, title: title.trim(), rationale: rationale.trim(), weekCount, units: built };
      const res = await updateTermPlan(centreId, planId, plan);
      if (res.error) {
        toast.error(res.error);
        if (res.issues?.length) setServerIssues(res.issues);
        return;
      }
      toast.success(wasApproved ? "Changes saved — the plan is back to draft until the principal approves it again." : "Changes saved.");
      onDone();
    });
  }

  const field = "min-h-[40px]";
  return (
    <div className="space-y-5 rounded-2xl border border-portal-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="plan-title">Plan title</Label>
          <Input id="plan-title" value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="plan-rationale">Rationale</Label>
          <Textarea id="plan-rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2} />
        </div>
      </div>

      {(issues.length > 0 || serverIssues.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> Fix these before saving
          </p>
          <ul className="mt-1 list-disc pl-5">
            {issues.map((i, n) => (
              <li key={`c${n}`}>{i.detail}</li>
            ))}
            {serverIssues.map((d, n) => (
              <li key={`s${n}`}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-4">
        {units.map((u, i) => {
          const weeks = weekRange(u.from, u.to, weekCount);
          return (
            <li key={i} className="space-y-3 rounded-2xl border border-portal-100 p-3" aria-label={`Unit ${i + 1}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit {i + 1}</span>
                <span className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move unit ${i + 1} up`} className="min-h-[36px]">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === units.length - 1} aria-label={`Move unit ${i + 1} down`} className="min-h-[36px]">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setUnits((prev) => prev.filter((_, n) => n !== i))} aria-label={`Remove unit ${i + 1}`} className="min-h-[36px] text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem_6rem]">
                <div className="space-y-1.5">
                  <Label htmlFor={`u${i}-title`}>Unit title</Label>
                  <Input id={`u${i}-title`} value={u.title} onChange={(e) => patch(i, { title: e.target.value })} className={field} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`u${i}-strand`}>Strand</Label>
                  <Input id={`u${i}-strand`} value={u.strand} onChange={(e) => patch(i, { strand: e.target.value })} list={`u${i}-strands`} className={field} />
                  <datalist id={`u${i}-strands`}>
                    {strandOptions.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`u${i}-from`}>From week</Label>
                  <Input id={`u${i}-from`} type="number" min={1} max={weekCount} value={u.from} onChange={(e) => patch(i, { from: Number(e.target.value) || 1 })} className={field} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`u${i}-to`}>To week</Label>
                  <Input id={`u${i}-to`} type="number" min={1} max={weekCount} value={u.to} onChange={(e) => patch(i, { to: Number(e.target.value) || 1 })} className={field} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`u${i}-desc`}>Description</Label>
                <Textarea id={`u${i}-desc`} value={u.description} onChange={(e) => patch(i, { description: e.target.value })} rows={2} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`u${i}-iq`}>Key inquiry questions (one per line)</Label>
                  <Textarea id={`u${i}-iq`} value={(u.inquiryQuestions ?? []).join("\n")} onChange={(e) => patch(i, { inquiryQuestions: e.target.value.split("\n") })} rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`u${i}-assess`}>Assessment</Label>
                  <Textarea id={`u${i}-assess`} value={u.assessment ?? ""} onChange={(e) => patch(i, { assessment: e.target.value })} rows={3} />
                </div>
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Outcomes ({u.outcomes.length} selected)</legend>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-portal-100 p-2">
                  {outcomeOptions.map((o) => {
                    const on = u.outcomes.some((x) => x.code === o.code);
                    return (
                      <label key={o.code} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1 text-sm hover:bg-portal-50">
                        <input type="checkbox" checked={on} onChange={() => toggleOutcome(i, o.code)} className="mt-1" aria-label={`${o.code} for unit ${i + 1}`} />
                        <span>
                          <span className="font-medium text-portal-800">{o.code}</span> <span className="text-foreground">{o.statement}</span>
                        </span>
                      </label>
                    );
                  })}
                  {outcomeOptions.length === 0 && <p className="text-xs text-muted-foreground">No syllabus outcomes loaded for this band.</p>}
                </div>
              </fieldset>
              <div className="space-y-1.5">
                <Label>Weekly focus</Label>
                <ul className="space-y-1.5">
                  {weeks.map((w) => (
                    <li key={w} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-sm font-medium text-portal-800">Wk {w}</span>
                      <Input
                        aria-label={`Unit ${i + 1} week ${w} focus`}
                        value={u.weeklyFocus.find((f) => f.week === w)?.focus ?? ""}
                        onChange={(e) => setFocus(i, w, e.target.value)}
                        placeholder={u.title}
                        className={field}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={addUnit} className="min-h-[44px]">
          <Plus className="mr-1.5 h-4 w-4" /> Add unit
        </Button>
        <Button type="button" onClick={save} disabled={!canSave} className="min-h-[44px] flex-1">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save changes
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="min-h-[44px]">
          Cancel
        </Button>
      </div>
      {wasApproved && (
        <p className="text-xs text-muted-foreground">This plan is approved. Saving changes returns it to draft until the principal approves the new version.</p>
      )}
    </div>
  );
}
