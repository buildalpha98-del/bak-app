"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Save, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SUBJECTS, SUBJECT_KEYS, type SubjectKey } from "@/lib/curriculum/subjects";
import { yearGroupLabel } from "@/lib/schools/year-groups";
import { saveTermPlan, type TermPlanTerm } from "@/lib/client/term-plan-actions";
import type { TermPlanIssue, TermPlanJson } from "@/lib/curriculum/term-plan";
import type { TeamClass } from "@/lib/client/portal-team";
import { TermPlanUnits } from "@/components/client/term-plan-card";

type Status = "idle" | "generating" | "preview" | "saving";

export function TermPlanGenerator({
  centreId,
  classes,
  term,
  frameworkLabel,
  initialClassId,
  initialSubject,
}: {
  centreId: string;
  classes: TeamClass[];
  term: TermPlanTerm;
  frameworkLabel: string;
  initialClassId?: string;
  initialSubject?: SubjectKey;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState<SubjectKey>(initialSubject ?? "pdhpe");
  const [classId, setClassId] = useState(initialClassId ?? (classes.length === 1 ? classes[0].id : ""));
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<{ plan: TermPlanJson; issues: TermPlanIssue[]; unknownCodes: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cls = classes.find((c) => c.id === classId) ?? null;
  const canGenerate = !!cls && status !== "generating";

  async function generate() {
    if (!canGenerate) return;
    setStatus("generating");
    setError(null);
    try {
      const res = await fetch(`/api/client/${centreId}/generate-term-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, classId, termId: term.id, notes: notes.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate the term plan.");
      setResult(json.data);
      setStatus("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate the term plan.");
      setStatus("idle");
    }
  }

  async function save() {
    if (!result || !cls) return;
    setStatus("saving");
    const { error: saveError } = await saveTermPlan(centreId, { classId: cls.id, subject, termId: term.id, plan: result.plan });
    if (saveError) {
      toast.error(saveError);
      setStatus("preview");
      return;
    }
    toast.success(`${term.name} plan saved for ${cls.name}.`);
    router.push(`/client/${centreId}/curriculum`);
  }

  const chip = (on: boolean) =>
    `min-h-[40px] rounded-full border px-3 text-sm ${
      on ? "border-portal-600 bg-portal-600 text-white" : "border-input bg-card text-foreground"
    }`;

  if (status !== "idle" && status !== "generating" && result) {
    const blocking = result.issues.length > 0;
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-portal-200 bg-portal-50 p-4">
          <h2 className="text-lg font-semibold text-foreground">{result.plan.title}</h2>
          <p className="mt-1 text-sm text-portal-800">
            {cls?.name} · {SUBJECTS[subject].label} · {term.name} · {result.plan.weekCount} weeks · {result.plan.units.length} units
          </p>
          {result.plan.rationale && <p className="mt-2 text-sm text-muted-foreground">{result.plan.rationale}</p>}
        </div>
        {(blocking || result.unknownCodes.length > 0) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" /> {blocking ? "This draft has gaps — regenerate before saving." : "Some codes the AI proposed were not in the syllabus and were removed."}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {result.issues.map((i, n) => (
                <li key={n}>{i.detail}</li>
              ))}
              {result.unknownCodes.length > 0 && <li>Removed: {result.unknownCodes.join(", ")}</li>}
            </ul>
          </div>
        )}
        <TermPlanUnits plan={result.plan} centreId={centreId} classId={cls?.id ?? null} subject={subject} term={term} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={blocking || status === "saving"} className="min-h-[44px] flex-1">
            {status === "saving" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save this plan
          </Button>
          <Button variant="outline" onClick={generate} className="min-h-[44px] flex-1">
            <RefreshCw className="mr-2 h-4 w-4" /> Regenerate
          </Button>
          <Button variant="ghost" onClick={() => { setStatus("idle"); setResult(null); }} className="min-h-[44px]">
            Start again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Subject</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Subject">
          {SUBJECT_KEYS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={subject === k} onClick={() => setSubject(k)} className={chip(subject === k)}>
              {SUBJECTS[k].label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Class</Label>
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No classes yet — ask Build Alpha Kids to import your class list.</p>
        ) : (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Class">
            {classes.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={classId === c.id} onClick={() => setClassId(c.id)} className={chip(classId === c.id)}>
                {c.name} · {yearGroupLabel(c.year_group)}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {term.name} · {term.weekCount} weeks · modelled on the Department&apos;s sample scope and sequence for the stage, with {frameworkLabel} codes from the syllabus.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Your steer (optional)</Label>
        <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. athletics carnival in week 6; keep a persuasive-writing focus" maxLength={400} />
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      <Button onClick={generate} disabled={!canGenerate} className="min-h-[44px]">
        {status === "generating" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {status === "generating" ? "Drafting the term…" : "Draft the term plan"}
      </Button>
    </div>
  );
}
