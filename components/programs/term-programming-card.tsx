"use client";

// Term programming: the one card that says whether the roster is
// programmed. Progress, the two ways to fill it (Auto-programme from the
// library, From school plans), the library gaps each with a link that
// opens the generator ready to write exactly that series, and what
// coaches said about this term's programmes.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, BookOpen, ClipboardList, Loader2, MessageSquareWarning, Sparkles } from "lucide-react";
import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { autoProgrammeTerm } from "@/lib/programs/actions";
import type { TermProgrammingStatus } from "@/lib/programs/term-programming-actions";

export function TermProgrammingCard({ status, basePath, rosterPath }: { status: TermProgrammingStatus; basePath: string; rosterPath: string }) {
  const router = useRouter();
  const [applying, setApplying] = useState(false);
  const t = status.term;
  if (!t) return null;
  const pct = status.sessions === 0 ? 0 : Math.round((status.programmed / status.sessions) * 100);
  const unprogrammed = status.sessions - status.programmed;

  async function handleAuto() {
    setApplying(true);
    const { data, error } = await autoProgrammeTerm({ termId: t!.id });
    setApplying(false);
    if (error || !data) {
      toast.error(error ?? "Failed to programme the term.");
      return;
    }
    toast.success(`${data.programmed} session${data.programmed === 1 ? "" : "s"} programmed${data.skipped ? ` — ${data.skipped} have no matching programme yet` : ""}.`);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border bg-background p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <BookOpen className="size-5 text-primary" /> {t.name} programming
          </h2>
          <p className="text-sm text-muted-foreground">
            {status.sessions === 0
              ? "Nothing is rostered for this term yet — set the term up first."
              : `${status.programmed} of ${status.sessions} sessions have a programme.`}
          </p>
        </div>
        <p className="text-3xl font-semibold tabular-nums text-foreground">{pct}%</p>
      </div>

      {status.sessions > 0 && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Sessions programmed">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      )}

      {status.sessions === 0 ? (
        <Button variant="outline" nativeButton={false} render={<Link href={`${rosterPath}/terms`} />} className="min-h-11">
          Open Terms
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleAuto} disabled={applying || status.auto_ready === 0} variant={status.auto_ready > 0 ? "default" : "outline"} className="min-h-11">
            {applying ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Auto-programme {status.auto_ready} session{status.auto_ready === 1 ? "" : "s"} from the library
          </Button>
          <Button
            variant={status.plans.sessions_ready > 0 ? "default" : "outline"}
            nativeButton={false}
            render={<Link href={`${rosterPath}/coverage`} />}
            className="min-h-11"
            disabled={status.plans.approved === 0}
          >
            <ClipboardList className="size-4" />
            {status.plans.approved === 0
              ? "No school plans approved yet"
              : `From school plans — ${status.plans.sessions_ready} session${status.plans.sessions_ready === 1 ? "" : "s"} to write`}
          </Button>
        </div>
      )}

      {status.gaps.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
            <AlertTriangle className="size-4" /> The library has nothing for {status.gaps.length} of the term&apos;s groups — {status.auto_skipped} session
            {status.auto_skipped === 1 ? "" : "s"} can&apos;t be auto-programmed until these exist.
          </p>
          <ul className="divide-y rounded-lg border">
            {status.gaps.map((g, i) => {
              const q = new URLSearchParams({ sport: g.sport, bands: g.bands.join(","), weeks: "10" });
              return (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium text-foreground">{g.sport}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {g.bands.join(", ") || "all ages"} · {g.centre_name} · {g.session_count} session{g.session_count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`${basePath}/generate?${q.toString()}`} />}>
                    <Sparkles className="size-3.5" /> Generate a 10-week series
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {unprogrammed > 0 && status.gaps.length === 0 && status.auto_ready === 0 && (
        <p className="text-sm text-muted-foreground">{unprogrammed} session{unprogrammed === 1 ? "" : "s"} still unprogrammed — check the roster.</p>
      )}

      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <MessageSquareWarning className="size-4 text-muted-foreground" /> Coach feedback this term
        </p>
        {status.feedback.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. Coaches rate a programme too easy / just right / too hard when they complete a session; anything rated off will show here.
          </p>
        ) : status.feedback.flagged.length === 0 ? (
          <p className="text-sm text-muted-foreground">{status.feedback.total} rating{status.feedback.total === 1 ? "" : "s"}, all &ldquo;just right&rdquo;.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {status.feedback.flagged.map((f) => (
              <li key={f.program_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <Link href={`${basePath}/${f.program_id}`} className="font-medium text-foreground hover:underline">
                  {f.title}
                </Link>
                <span className="text-muted-foreground">
                  {f.too_hard > 0 && `${f.too_hard} too hard`}
                  {f.too_hard > 0 && f.too_easy > 0 && " · "}
                  {f.too_easy > 0 && `${f.too_easy} too easy`}
                  {f.just_right > 0 && ` · ${f.just_right} just right`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
