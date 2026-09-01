"use client";

// One-click term programming: preview which band-matched series /
// programmes will attach to every unprogrammed session of the term,
// then apply. Scope & Sequence fills itself from here.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Loader2, AlertTriangle } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  autoProgrammeTerm,
  type AutoProgrammeResult,
} from "@/lib/programs/actions";

interface AutoProgrammeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  termId: string;
  termName: string;
  centres: { id: string; name: string }[];
  onSuccess: () => void;
}

export function AutoProgrammeDialog({
  open,
  onOpenChange,
  termId,
  termName,
  centres,
  onSuccess,
}: AutoProgrammeDialogProps) {
  const [centreId, setCentreId] = useState<string>("all");
  const [preview, setPreview] = useState<AutoProgrammeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    autoProgrammeTerm({
      termId,
      centreId: centreId === "all" ? null : centreId,
      dryRun: true,
    }).then(({ data, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error || !data) {
        toast.error(error ?? "Failed to preview.");
        return;
      }
      setPreview(data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, termId, centreId]);

  async function handleApply() {
    setApplying(true);
    const { data, error } = await autoProgrammeTerm({
      termId,
      centreId: centreId === "all" ? null : centreId,
    });
    setApplying(false);
    if (error || !data) {
      toast.error(error ?? "Failed to programme the term.");
      return;
    }
    toast.success(
      `${data.programmed} session${data.programmed === 1 ? "" : "s"} programmed` +
        (data.skipped > 0 ? ` — ${data.skipped} had no matching programme` : "") +
        "."
    );
    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Auto-programme {termName}</DialogTitle>
          <DialogDescription>
            Attaches the best age-matched series (week by week) or programme to
            every session that doesn&apos;t have one yet. Existing programmes
            are never touched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Select value={centreId} onValueChange={(v) => setCentreId(v ?? "all")}>
            <SelectTrigger>
              <SelectValue placeholder="All centres" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All centres</SelectItem>
              {centres.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : preview && preview.groups.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Nothing to programme — every session in this term already has a
              programme.
            </p>
          ) : preview ? (
            <div className="space-y-2">
              {preview.groups.map((g, i) => (
                <div
                  key={i}
                  className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${
                    g.source_kind === "none"
                      ? "border-amber-200 bg-amber-50"
                      : "bg-muted/30"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {g.sport}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {g.centre_name}
                      </span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {g.bands.map((b) => (
                        <Badge key={b} variant="outline" className="text-[10px]">
                          {b}
                        </Badge>
                      ))}
                      {g.source_kind === "none" ? (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <AlertTriangle className="size-3" />
                          No matching programme in the library
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <BookOpen className="size-3" />
                          {g.source}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {g.session_count} session{g.session_count === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {preview.programmed} session
                {preview.programmed === 1 ? "" : "s"} will be programmed
                {preview.skipped > 0
                  ? `; ${preview.skipped} skipped (fill the library gaps first)`
                  : ""}
                .
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={applying || loading || !preview || preview.programmed === 0}
            onClick={handleApply}
          >
            {applying && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Programme {preview?.programmed ?? 0} session
            {(preview?.programmed ?? 0) === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
