"use client";

// Students × skills for one class and one sport this term. A teacher
// fills a row per student and saves it; the same row shape the
// one-by-one flow writes, through the same server action, so both
// surfaces stay interchangeable (migration 088).

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { saveClientChildRating, type ClassAssessmentGrid } from "@/lib/client/assessment-actions";
import { countAssessed, type GridRow } from "@/lib/client/assessment-grid";
import { frameworkOf, type FrameworkKey } from "@/lib/curriculum/frameworks";
import { subjectOf } from "@/lib/curriculum/subjects";

const MARKS = [1, 2, 3, 4, 5] as const;

export function ClassAssessmentGrid({
  centreId,
  grid,
  frameworkKey,
}: {
  centreId: string;
  grid: ClassAssessmentGrid;
  /** The school's curriculum (migration 095): names the mark scale. */
  frameworkKey?: FrameworkKey;
}) {
  const markScale = frameworkOf(frameworkKey).markScale;
  const router = useRouter();
  const [rows, setRows] = useState<GridRow[]>(grid.rows);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  // Leaving mid-save would drop the rows still in flight.
  useEffect(() => {
    if (saving.size === 0 && dirty.size === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving.size, dirty.size]);

  const skills = grid.template.skills;
  const assessed = countAssessed(rows);

  function setMark(childId: string, skill: string, value: number | null) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.child.id !== childId) return r;
        const marks = { ...r.marks };
        if (value === null) delete marks[skill];
        else marks[skill] = value;
        return { ...r, marks };
      })
    );
    setDirty((prev) => new Set(prev).add(childId));
  }

  function setNotes(childId: string, notes: string) {
    setRows((prev) => prev.map((r) => (r.child.id === childId ? { ...r, notes } : r)));
    setDirty((prev) => new Set(prev).add(childId));
  }

  async function saveRow(row: GridRow): Promise<boolean> {
    const ratings_json = Object.entries(row.marks).map(([skill_name, rating]) => ({
      skill_name,
      rating,
    }));
    if (ratings_json.length === 0) {
      toast.error(`Rate at least one skill for ${row.child.first_name} first.`);
      return false;
    }
    setSaving((prev) => new Set(prev).add(row.child.id));
    const { error } = await saveClientChildRating(centreId, {
      assessment_template_id: grid.template.id,
      child_id: row.child.id,
      term_id: grid.term.id,
      ratings_json,
      notes: row.notes.trim() || null,
    });
    setSaving((prev) => {
      const next = new Set(prev);
      next.delete(row.child.id);
      return next;
    });
    if (error) {
      toast.error(`${row.child.first_name}: ${error}`);
      return false;
    }
    setRows((prev) =>
      prev.map((r) => (r.child.id === row.child.id ? { ...r, author: "me", editable: true } : r))
    );
    setDirty((prev) => {
      const next = new Set(prev);
      next.delete(row.child.id);
      return next;
    });
    return true;
  }

  function saveAll() {
    startTransition(async () => {
      const pending = rows.filter((r) => dirty.has(r.child.id) && r.editable);
      // In parallel — see quiz-marking.tsx.
      const ok = (await Promise.all(pending.map((row) => saveRow(row)))).filter(Boolean).length;
      if (ok > 0) toast.success(`${ok} ${ok === 1 ? "student" : "students"} saved.`);
      router.refresh();
    });
  }

  return (
    <div className="animate-fade-up space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/client/${centreId}/assessments`}
            className="inline-flex items-center gap-1 text-sm text-portal-700 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> All classes
          </Link>
          <h1 className="mt-1 text-2xl font-bold font-heading text-foreground">
            {grid.class.name} — {grid.template.subject !== "pdhpe" ? `${subjectOf(grid.template.subject).label}: ` : ""}
            {grid.template.sport}
          </h1>
          <p className="text-muted-foreground mt-1">
            {grid.term.name} · {grid.template.age_group} yrs ·{" "}
            {grid.class.teacher_name ? `${grid.class.teacher_name} · ` : ""}
            {assessed} of {rows.length} students assessed
          </p>
        </div>
        <Button onClick={saveAll} disabled={dirty.size === 0 || saving.size > 0} className="min-h-[44px]">
          {saving.size > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          <span className="ml-1.5">
            Save {dirty.size > 0 ? `${dirty.size} ${dirty.size === 1 ? "change" : "changes"}` : "changes"}
          </span>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Scale: {MARKS.map((m) => `${m} ${markScale[m]}`).join(" · ")}. Hover a skill for its
        descriptor. Rows rated by your coach are locked.
      </p>

      <div className="overflow-x-auto rounded-xl border border-portal-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-portal-50 text-xs uppercase tracking-wide text-portal-800">
            <tr>
              <th className="sticky left-0 z-10 bg-portal-50 px-3 py-2 text-left font-semibold">
                Student
              </th>
              {skills.map((s) => (
                <th
                  key={s.name}
                  className="px-2 py-2 text-center font-semibold min-w-[6.5rem]"
                  title={s.description}
                >
                  {s.name}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-semibold min-w-[14rem]">Teacher comment</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSaving = saving.has(row.child.id);
              const isDirty = dirty.has(row.child.id);
              const name = `${row.child.first_name} ${row.child.last_name}`;
              return (
                <tr key={row.child.id} className="border-t border-portal-100 align-top">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium whitespace-nowrap">
                    {name}
                  </td>
                  {skills.map((s) => (
                    <td key={s.name} className="px-2 py-1.5 text-center">
                      <select
                        aria-label={`${name} – ${s.name}`}
                        className="h-10 w-16 rounded-md border border-portal-200 bg-white text-center text-sm disabled:bg-muted disabled:text-muted-foreground"
                        value={row.marks[s.name] ?? ""}
                        disabled={!row.editable || isSaving}
                        onChange={(e) =>
                          setMark(row.child.id, s.name, e.target.value ? Number(e.target.value) : null)
                        }
                      >
                        <option value="">—</option>
                        {MARKS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                  <td className="px-3 py-1.5">
                    <textarea
                      aria-label={`${name} – teacher comment`}
                      className="min-h-[40px] w-full rounded-md border border-portal-200 px-2 py-1 text-sm disabled:bg-muted"
                      rows={1}
                      value={row.notes}
                      disabled={!row.editable || isSaving}
                      placeholder={row.editable ? "Printed on the report card" : ""}
                      onChange={(e) => setNotes(row.child.id, e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.author === "coach" ? (
                      <Badge variant="outline" className="gap-1">
                        <Lock className="h-3 w-3" /> Coach
                      </Badge>
                    ) : row.author === "colleague" ? (
                      <Badge variant="outline" className="gap-1">
                        <Lock className="h-3 w-3" /> Colleague
                      </Badge>
                    ) : isDirty ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[36px]"
                        disabled={isSaving}
                        onClick={() => void saveRow(row)}
                      >
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                      </Button>
                    ) : row.author === "me" ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Saved</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={skills.length + 3} className="px-3 py-8 text-center text-muted-foreground">
                  No students in this class match the {grid.template.age_group} age band.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
