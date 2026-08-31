"use client";

// CSV class-list import (design: 2026-08-26-school-classes-design.md,
// "Data entry"). Two-step: preview shows exactly what a commit will do
// (classes created, students matched/unmatched/ambiguous) before any
// write. The server re-parses the CSV on commit — the preview is
// advisory, never the write payload.

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  previewClassImport,
  commitClassImport,
  type ClassImportPreview,
} from "@/lib/schools/class-actions";

interface ClassImportDialogProps {
  centreId: string;
  onImported: () => void;
}

export function ClassImportDialog({ centreId, onImported }: ClassImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ClassImportPreview | null>(null);
  const [createMissing, setCreateMissing] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setCsvText(null);
    setFileName(null);
    setPreview(null);
    setCreateMissing(true);
    setBusy(false);
  };

  const runPreview = async (text: string, cm: boolean) => {
    setBusy(true);
    let data, error;
    try {
      ({ data, error } = await previewClassImport(centreId, text, {
        createMissing: cm,
      }));
    } catch {
      error = "Couldn't read that file — check the connection and try again.";
    } finally {
      setBusy(false);
    }
    if (error || !data) {
      toast.error(error ?? "Couldn't read that file.");
      return false;
    }
    setPreview(data);
    return true;
  };

  const handleFile = async (file: File) => {
    if (file.size > 500_000) {
      toast.error("File too large (500KB max).");
      return;
    }
    const text = await file.text().catch(() => null);
    if (text === null) {
      toast.error("Couldn't read that file.");
      return;
    }
    setCsvText(text);
    setFileName(file.name);
    const ok = await runPreview(text, createMissing);
    if (!ok) {
      setCsvText(null);
      setFileName(null);
    }
  };

  const handleToggleCreateMissing = async (next: boolean) => {
    setCreateMissing(next);
    if (csvText) await runPreview(csvText, next);
  };

  const handleCommit = async () => {
    if (!csvText) return;
    setBusy(true);
    let data, error;
    try {
      ({ data, error } = await commitClassImport(centreId, csvText, {
        createMissing,
      }));
    } catch {
      error = "Import failed — check the connection and try again.";
    } finally {
      setBusy(false);
    }
    if (error || !data) {
      toast.error(error ?? "Import failed.");
      return;
    }
    const parts = [
      data.createdClasses > 0
        ? `${data.createdClasses} class${data.createdClasses === 1 ? "" : "es"} created`
        : null,
      data.createdStudents > 0
        ? `${data.createdStudents} new student${data.createdStudents === 1 ? "" : "s"} enrolled`
        : null,
      `${data.assigned} student${data.assigned === 1 ? "" : "s"} assigned`,
    ].filter(Boolean);
    toast.success(`Import complete — ${parts.join(", ")}.`);
    if (data.unmatched > 0 || data.ambiguous > 0) {
      toast.warning(
        `${data.unmatched + data.ambiguous} row${
          data.unmatched + data.ambiguous === 1 ? " was" : "s were"
        } skipped — assign those students manually from the class cards.`
      );
    }
    setOpen(false);
    reset();
    onImported();
  };

  const plan = preview?.plan;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Upload className="mr-1.5 size-4" />
        Import class list
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import class list</DialogTitle>
            <DialogDescription>
              Upload the school&apos;s class list CSV — columns like{" "}
              <span className="font-mono text-xs">Student name, Year, Class, Teacher</span>.
              Schools can export this from their student system. Nothing is saved
              until you confirm the preview.
            </DialogDescription>
          </DialogHeader>

          {!preview ? (
            <div className="space-y-3">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed p-8 text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-muted/40"
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Upload className="size-5" />
                )}
                {busy ? "Reading file…" : "Choose a CSV file"}
              </button>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{fileName}</span> —{" "}
                {preview.rowCount} student row{preview.rowCount === 1 ? "" : "s"} read.
              </p>

              <div className="space-y-2">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Classes
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {plan?.classes.map((c) => (
                    <Badge key={c.name} variant={c.existing_id ? "secondary" : "default"}>
                      {c.name} · Yr {c.year_group}
                      {c.teacher_name ? ` · ${c.teacher_name}` : ""}
                      {c.existing_id ? "" : " (new)"}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-foreground">
                <Check className="size-4 text-green-600" />
                {plan?.assignments.length ?? 0} student
                {(plan?.assignments.length ?? 0) === 1 ? "" : "s"} matched to the
                enrolled roster and will be assigned.
              </div>

              {(plan?.creations.length ?? 0) > 0 && (
                <div className="space-y-1 rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">
                  <div className="flex items-center gap-2 font-medium">
                    <Check className="size-4 shrink-0" />
                    {plan!.creations.length} new student
                    {plan!.creations.length === 1 ? "" : "s"} will be created and
                    enrolled
                  </div>
                  <p className="text-xs">
                    {plan!.creations
                      .slice(0, 10)
                      .map((c) => `${c.firstName} ${c.lastName} (${c.className})`)
                      .join(", ")}
                    {plan!.creations.length > 10 ? "…" : ""}
                  </p>
                </div>
              )}

              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={createMissing}
                  disabled={busy}
                  onChange={(e) => void handleToggleCreateMissing(e.target.checked)}
                />
                <span>
                  Create and enrol students who aren&apos;t on the roster yet.
                  Untick to only assign students already enrolled (new names are
                  skipped and listed instead).
                </span>
              </label>

              {(plan?.unmatched.length ?? 0) > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="size-4 shrink-0" />
                    {plan!.unmatched.length} not on the enrolled roster (skipped)
                  </div>
                  <p className="text-xs">
                    {plan!.unmatched
                      .slice(0, 8)
                      .map((r) => r.studentName)
                      .join(", ")}
                    {plan!.unmatched.length > 8 ? "…" : ""}
                  </p>
                </div>
              )}

              {(plan?.ambiguous.length ?? 0) > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="size-4 shrink-0" />
                    {plan!.ambiguous.length} matched more than one student (skipped)
                  </div>
                  <p className="text-xs">
                    {plan!.ambiguous.map((a) => a.row.studentName).join(", ")} — assign
                    manually from the class cards.
                  </p>
                </div>
              )}

              {(plan?.warnings.length ?? 0) > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {plan!.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}

              {preview.parseErrors.length > 0 && (
                <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                  <p className="font-medium">
                    {preview.parseErrors.length} row
                    {preview.parseErrors.length === 1 ? "" : "s"} couldn&apos;t be read
                  </p>
                  <ul className="list-disc pl-5 text-xs">
                    {preview.parseErrors.slice(0, 5).map((e) => (
                      <li key={`${e.line}-${e.message}`}>
                        Row {e.line}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {preview && (
            <DialogFooter className="gap-2">
              <Button variant="outline" disabled={busy} onClick={reset}>
                Choose another file
              </Button>
              <Button
                disabled={
                  busy ||
                  (plan?.assignments.length ?? 0) +
                    (plan?.creations.length ?? 0) +
                    (plan?.classes.length ?? 0) ===
                    0
                }
                onClick={handleCommit}
              >
                {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                Import
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
