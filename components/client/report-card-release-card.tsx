"use client";

// Term sign-off for report cards (migration 090). Primary contact: set
// the teachers' due date, see progress, release (or withdraw). Everyone
// else: the due date and whether cards are out yet.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, FileCheck2, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  releaseReportCards,
  setReportCardDueDate,
  withdrawReportCards,
  type ReportCardRelease,
} from "@/lib/client/report-card-actions";
import { daysUntilDue } from "@/lib/client/report-card-release";
import { SYDNEY_TZ, sydneyTodayIso } from "@/lib/utils/sydney-time";

function fmtDate(iso: string): string {
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: SYDNEY_TZ,
  });
}

export function ReportCardReleaseCard({
  centreId,
  release,
  isPrimary,
  assessed,
  total,
}: {
  centreId: string;
  release: ReportCardRelease;
  isPrimary: boolean;
  assessed: number;
  total: number;
}) {
  const router = useRouter();
  const [dueDate, setDueDate] = useState(release.due_date ?? "");
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const days = daysUntilDue(release, sydneyTodayIso());
  const released = !!release.released_at;

  function saveDue() {
    startTransition(async () => {
      const { error } = await setReportCardDueDate(centreId, release.term_id, dueDate || null);
      if (error) return void toast.error(error);
      toast.success(dueDate ? `Teachers to finish by ${fmtDate(dueDate)}.` : "Due date cleared.");
      router.refresh();
    });
  }

  function doRelease() {
    startTransition(async () => {
      const { error } = await releaseReportCards(centreId, release.term_id);
      if (error) return void toast.error(error);
      toast.success(`${release.term_name} report cards released.`);
      setConfirming(false);
      router.refresh();
    });
  }

  function doWithdraw() {
    startTransition(async () => {
      const { error } = await withdrawReportCards(centreId, release.term_id);
      if (error) return void toast.error(error);
      toast.success("Report cards withdrawn — teachers can no longer open them until you release again.");
      router.refresh();
    });
  }

  return (
    <div
      className={`rounded-xl border p-4 ${
        released ? "border-emerald-200 bg-emerald-50" : "border-portal-200 bg-portal-50"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {released ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
          ) : (
            <FileCheck2 className="h-5 w-5 text-portal-600 mt-0.5 flex-shrink-0" />
          )}
          <div>
            <p className="font-medium text-foreground">
              {release.term_name} report cards:{" "}
              {released ? (
                <span className="text-emerald-800">
                  released {fmtDate(release.released_at!)}
                  {release.released_by_name ? ` by ${release.released_by_name}` : ""}
                </span>
              ) : (
                <span className="text-portal-800">not yet released</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {assessed} of {total} student assessments done this term
              {release.due_date && !released && (
                <>
                  {" · "}
                  <CalendarClock className="inline h-3.5 w-3.5 -mt-0.5" /> teachers to finish by{" "}
                  {fmtDate(release.due_date)}
                  {days !== null &&
                    (days < 0 ? ` (${-days} ${-days === 1 ? "day" : "days"} overdue)` : days === 0 ? " (today)" : ` (${days} ${days === 1 ? "day" : "days"} left)`)}
                </>
              )}
              {!isPrimary && !released && " · report cards open once the principal releases them"}
            </p>
          </div>
        </div>

        {isPrimary && (
          <div className="flex flex-wrap items-center gap-2">
            {!released && (
              <>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  aria-label="Teachers to finish by"
                  className="min-h-[44px] w-[11rem]"
                />
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={saveDue}
                  disabled={isPending || dueDate === (release.due_date ?? "")}
                >
                  Save date
                </Button>
                {confirming ? (
                  <>
                    <Button className="min-h-[44px]" onClick={doRelease} disabled={isPending}>
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, release"}
                    </Button>
                    <Button variant="ghost" className="min-h-[44px]" onClick={() => setConfirming(false)} disabled={isPending}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button className="min-h-[44px]" onClick={() => setConfirming(true)} disabled={isPending}>
                    Release report cards
                  </Button>
                )}
              </>
            )}
            {released && (
              <Button variant="outline" className="min-h-[44px]" onClick={doWithdraw} disabled={isPending}>
                <Undo2 className="h-4 w-4 mr-1.5" /> Withdraw
              </Button>
            )}
          </div>
        )}
      </div>
      {confirming && (
        <p className="mt-3 text-sm text-portal-800">
          Releasing lets every teacher and colleague open and download the {release.term_name} report
          cards. {total - assessed > 0 ? `${total - assessed} students have no marks yet and will get a card without marks.` : "Every student has marks."}
        </p>
      )}
    </div>
  );
}
