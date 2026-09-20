"use client";

// Teachers generate an English / Mathematics lesson (migration 091).
// Pick the subject, its focus area, the class (which sets the age
// band), the length and the resources on hand; preview; save to the
// school's library.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgramView } from "@/components/programs/program-view";
import { SUBJECTS, type SubjectKey } from "@/lib/curriculum/subjects";
import { LESSON_SUBJECT_KEYS, LESSON_DURATIONS } from "@/lib/client/lesson-input";
import { yearGroupToAgeBand, yearGroupLabel } from "@/lib/schools/year-groups";
import { saveSchoolLesson } from "@/lib/client/lesson-actions";
import type { ProgramContentJson } from "@/lib/ai/types";
import type { TeamClass } from "@/lib/client/portal-team";

type Status = "idle" | "generating" | "preview" | "saving";

export function LessonGenerateForm({
  centreId,
  classes,
}: {
  centreId: string;
  classes: TeamClass[];
}) {
  const router = useRouter();
  const [subject, setSubject] = useState<(typeof LESSON_SUBJECT_KEYS)[number]>("english");
  const subjectDef = SUBJECTS[subject];
  const [focus, setFocus] = useState("");
  const [classId, setClassId] = useState(classes.length === 1 ? classes[0].id : "");
  const [duration, setDuration] = useState<number>(45);
  const [learningFocus, setLearningFocus] = useState("");
  const [resources, setResources] = useState<string[]>([...subjectDef.resourceOptions]);
  const [status, setStatus] = useState<Status>("idle");
  const [content, setContent] = useState<ProgramContentJson | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cls = classes.find((c) => c.id === classId) ?? null;
  const ageBand = cls ? yearGroupToAgeBand(cls.year_group) : null;
  const canGenerate = !!focus && !!cls && resources.length > 0 && status !== "generating";

  function changeSubject(next: SubjectKey) {
    if (!(LESSON_SUBJECT_KEYS as readonly string[]).includes(next)) return;
    setSubject(next as (typeof LESSON_SUBJECT_KEYS)[number]);
    setFocus("");
    setResources([...SUBJECTS[next].resourceOptions]);
  }

  function toggleResource(r: string) {
    setResources((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  async function generate() {
    if (!canGenerate || !ageBand) return;
    setStatus("generating");
    setError(null);
    try {
      const res = await fetch(`/api/client/${centreId}/generate-lesson`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          focus,
          ageBand,
          durationMinutes: duration,
          learningFocus: learningFocus.trim() || undefined,
          resources,
          classId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate the lesson.");
      setContent(json.data as ProgramContentJson);
      setStatus("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate the lesson.");
      setStatus("idle");
    }
  }

  async function save() {
    if (!content || !ageBand) return;
    setStatus("saving");
    const { data, error: saveError } = await saveSchoolLesson(centreId, {
      subject,
      focus,
      ageBand,
      durationMinutes: duration,
      learningFocus: learningFocus.trim() || null,
      resources,
      classId: classId || null,
      content,
    });
    if (saveError || !data) {
      toast.error(saveError ?? "Failed to save the lesson.");
      setStatus("preview");
      return;
    }
    toast.success("Lesson saved to your school's library.");
    router.push(`/client/${centreId}/programs/${data.id}`);
  }

  const chip = (on: boolean) =>
    `min-h-[40px] rounded-full border px-3 text-sm ${
      on ? "border-portal-600 bg-portal-600 text-white" : "border-input bg-card text-foreground"
    }`;

  if (status === "preview" && content) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-portal-200 bg-white p-4 sm:p-6">
          <ProgramView content={content} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={save} className="min-h-[44px] flex-1">
            <Save className="h-4 w-4 mr-1.5" /> Save to your school&apos;s library
          </Button>
          <Button variant="outline" onClick={generate} className="min-h-[44px] flex-1">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Regenerate
          </Button>
          <Button variant="ghost" onClick={() => setStatus("idle")} className="min-h-[44px]">
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-1.5">
        <Label>Subject</Label>
        <div className="flex gap-2" role="radiogroup" aria-label="Subject">
          {LESSON_SUBJECT_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={subject === k}
              onClick={() => changeSubject(k)}
              className={`min-h-[44px] rounded-xl border px-4 text-sm ${
                subject === k ? "border-portal-600 bg-portal-50 text-portal-800" : "border-input bg-card"
              }`}
            >
              {SUBJECTS[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{subjectDef.strandLabel}</Label>
        <div className="flex flex-wrap gap-1.5" aria-label={subjectDef.strandLabel}>
          {subjectDef.strandOptions.map((s) => (
            <button key={s} type="button" aria-pressed={focus === s} onClick={() => setFocus(s)} className={chip(focus === s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Class</Label>
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No classes yet — ask Build Alpha Kids to import your class list.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5" aria-label="Class">
            {classes.map((c) => (
              <button key={c.id} type="button" aria-pressed={classId === c.id} onClick={() => setClassId(c.id)} className={chip(classId === c.id)}>
                {c.name} · {yearGroupLabel(c.year_group)}
              </button>
            ))}
          </div>
        )}
        {ageBand && (
          <p className="text-xs text-muted-foreground">Pitched at the {ageBand} age band.</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Lesson length</Label>
          <div className="flex gap-1.5" aria-label="Lesson length">
            {LESSON_DURATIONS.map((d) => (
              <button key={d} type="button" aria-pressed={duration === d} onClick={() => setDuration(d)} className={chip(duration === d)}>
                {d} min
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="learning-focus">Learning focus (optional)</Label>
          <Input
            id="learning-focus"
            value={learningFocus}
            onChange={(e) => setLearningFocus(e.target.value)}
            placeholder={subject === "english" ? "e.g. inferring from picture books" : "e.g. bridging to ten"}
            className="min-h-[44px]"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Resources on hand</Label>
        <div className="flex flex-wrap gap-1.5" aria-label="Resources">
          {subjectDef.resourceOptions.map((r) => (
            <button key={r} type="button" aria-pressed={resources.includes(r)} onClick={() => toggleResource(r)} className={chip(resources.includes(r))}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button onClick={generate} disabled={!canGenerate} className="min-h-[44px]">
          {status === "generating" ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Writing your lesson…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-1.5" /> Generate {subjectDef.label} lesson
            </>
          )}
        </Button>
        <Link href={`/client/${centreId}/programs`} className="text-sm text-muted-foreground hover:underline">
          Back to Programs
        </Link>
      </div>
    </div>
  );
}
