"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  MapPin,
  Phone,
  Building2,
  Package,
  Star,
  Clock,
  DollarSign,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { SessionStatusBadge } from "@/components/roster/session-status-badge";
import { ShiftThread } from "@/components/coach/schedule/shift-thread";
import { SwapRequestDialog } from "@/components/coach/schedule/swap-request-dialog";
import { formatTime12 } from "@/lib/utils/roster";
import { sportColour } from "@/lib/utils/sport-colours";
import { confirmShift, declineShift } from "@/lib/sessions/shift-actions";
import { startSession } from "@/lib/sessions/session-workflow-actions";
import { getProgramById } from "@/lib/programs/actions";
import { ProgramView } from "@/components/programs/program-view";
import type { ProgramContentJson } from "@/lib/ai/types";
import type { CoachSessionDetail } from "@/lib/sessions/coach-actions";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { useEffect } from "react";

// ============================================================
// Helpers
// ============================================================

function getEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.slice(0, 5).split(":").map(Number);
  const totalMins = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = totalMins % 60;
  return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function mapsUrl(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  access_logistics: "Access & Logistics",
  safety: "Safety",
};

// ============================================================
// Props
// ============================================================

interface SessionDetailViewProps {
  detail: CoachSessionDetail;
  currentUserId: string;
}

// ============================================================
// Component
// ============================================================

export function SessionDetailView({
  detail,
  currentUserId,
}: SessionDetailViewProps) {
  const router = useRouter();
  const { session, centreNotes, program, equipmentKit, equipmentItems, shiftThread, feedback } = detail;

  const [showNotes, setShowNotes] = useState(false);
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const endTime = getEndTime(session.time, session.duration_minutes);
  const sportDot = sportColour(session.sport);

  // Check if session can be started (within 30 minutes)
  const sessionDateTime = new Date(`${session.date}T${session.time}`);
  const canStart =
    session.status === "confirmed" &&
    sessionDateTime.getTime() - Date.now() <= 30 * 60 * 1000;

  // Pay rate display
  const payRate = session.pay_rate_override ?? session.pay_rate_resolved;

  // --------------------------------------------------------
  // Action handlers
  // --------------------------------------------------------

  function handleConfirm() {
    startTransition(async () => {
      const result = await confirmShift(session.id);
      if (result.error) {
        console.error(result.error);
      }
      router.refresh();
    });
  }

  function handleDecline() {
    if (!showDeclineReason) {
      setShowDeclineReason(true);
      return;
    }
    if (!declineReason.trim()) return;
    startTransition(async () => {
      const result = await declineShift(session.id, declineReason.trim());
      if (result.error) {
        console.error(result.error);
      }
      router.refresh();
    });
  }

  function handleStart() {
    startTransition(async () => {
      const result = await startSession(session.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Session started!");
        router.push(`/coach/schedule/${session.id}/active`);
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      {/* ========== Header ========== */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="shrink-0 min-h-[44px] min-w-[44px]"
        >
          <ChevronLeft className="size-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{formatDate(session.date)}</p>
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-2.5 rounded-full shrink-0"
              style={{ backgroundColor: sportDot }}
            />
            <h1 className="text-lg font-semibold text-foreground truncate">
              {session.sport}
            </h1>
            <SessionStatusBadge status={session.status} />
          </div>
        </div>
      </div>

      {/* ========== Time ========== */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Clock className="size-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {formatTime12(session.time)} – {formatTime12(endTime)}
            </p>
            <p className="text-xs text-muted-foreground">
              {session.duration_minutes} minutes
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ========== Centre ========== */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 size-5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {session.centre_name}
              </p>
              <Badge variant="outline" className="mt-1 text-[10px]">
                {session.centre_type === "childcare_centre"
                  ? "Childcare Centre"
                  : session.centre_type === "school"
                    ? "School"
                    : session.centre_type}
              </Badge>
            </div>
          </div>

          {session.centre_address && (
            <a
              href={mapsUrl(session.centre_address)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 text-sm text-primary hover:underline"
            >
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span>{session.centre_address}</span>
            </a>
          )}

          {session.centre_contact_phone && (
            <a
              href={`tel:${session.centre_contact_phone}`}
              className="flex items-center gap-3 text-sm text-primary hover:underline"
            >
              <Phone className="size-4 shrink-0" />
              <span>
                {session.centre_contact_name
                  ? `${session.centre_contact_name} — `
                  : ""}
                {session.centre_contact_phone}
              </span>
            </a>
          )}

          {/* Centre notes (collapsible) */}
          {centreNotes.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowNotes(!showNotes)}
                className="flex w-full items-center justify-between py-1 text-sm font-medium text-muted-foreground"
              >
                <span>Operational Notes ({centreNotes.length})</span>
                {showNotes ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>

              {showNotes && (
                <div className="mt-2 space-y-2">
                  {centreNotes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-md bg-muted/30 p-2.5"
                    >
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        {CATEGORY_LABELS[note.category] ?? note.category}
                      </p>
                      <p className="mt-0.5 text-xs text-foreground whitespace-pre-wrap">
                        {note.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========== Programme ========== */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">Programme</h3>
          </div>

          {program ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{program.sport}</span>
                  {program.age_group && (
                    <>
                      <span>·</span>
                      <span>{program.age_group}</span>
                    </>
                  )}
                  {program.skill_focus && (
                    <>
                      <span>·</span>
                      <span>{program.skill_focus}</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {program.duration_minutes} min programme · v{program.version_number}
                </p>
              </div>
              <CoachProgramContent programId={program.id} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No programme assigned to this session.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ========== Equipment ========== */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">Equipment</h3>
          </div>

          {equipmentKit ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm text-foreground">{equipmentKit.name}</p>
                <Badge variant="outline" className="text-[10px]">
                  {equipmentKit.condition}
                </Badge>
              </div>

              {equipmentItems.length > 0 && (
                <div className="rounded-md border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                          Item
                        </th>
                        <th className="px-2 py-1.5 text-center font-medium text-muted-foreground">
                          Qty
                        </th>
                        <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                          Condition
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {equipmentItems.map((item) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="px-2 py-1.5 text-foreground">
                            {item.item_type}
                          </td>
                          <td className="px-2 py-1.5 text-center text-muted-foreground">
                            {item.quantity}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                            >
                              {item.condition}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No equipment kit assigned to this session.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ========== Pay Rate ========== */}
      {payRate != null && (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <DollarSign className="size-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                ${payRate.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                {session.pay_rate_override ? "Custom rate" : "Standard rate"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========== Actions ========== */}
      {session.status === "pending_confirmation" && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-medium text-foreground">
              Action Required
            </h3>

            <div className="flex gap-2">
              <Button
                onClick={handleConfirm}
                disabled={isPending}
                className="flex-1 min-h-[44px] bg-green-600 hover:bg-green-700"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 size-4" />
                    Confirm
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDecline}
                disabled={isPending}
                className="flex-1 min-h-[44px]"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <XCircle className="mr-2 size-4" />
                    Decline
                  </>
                )}
              </Button>
            </div>

            {showDeclineReason && (
              <div className="space-y-2">
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Reason for declining (required)..."
                  rows={2}
                  className="w-full rounded-lg border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive/30 focus:border-destructive"
                />
                <Button
                  variant="destructive"
                  onClick={handleDecline}
                  disabled={isPending || !declineReason.trim()}
                  className="w-full min-h-[44px]"
                >
                  {isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Confirm Decline
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {session.status === "confirmed" && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex gap-2">
              <Button
                onClick={handleStart}
                disabled={isPending || !canStart}
                className="flex-1 min-h-[44px] bg-primary hover:bg-primary/90"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Start Session"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setSwapDialogOpen(true)}
                className="min-h-[44px]"
              >
                <ArrowRightLeft className="mr-2 size-4" />
                Swap
              </Button>
            </div>
            {!canStart && (
              <p className="text-xs text-muted-foreground text-center">
                Start button activates 30 minutes before session time.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {session.status === "in_progress" && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-center gap-2 text-sm text-primary">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              Session in progress
            </div>
            <Button
              className="w-full min-h-[44px] bg-primary hover:bg-primary/90 text-white"
              nativeButton={false}
              render={
                <Link href={`/coach/schedule/${session.id}/active`} />
              }
            >
              <Play className="size-4" />
              Resume Session
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ========== Shift Thread ========== */}
      <Card>
        <CardContent className="p-4">
          <ShiftThread
            sessionId={session.id}
            messages={shiftThread}
            currentUserId={currentUserId}
          />
        </CardContent>
      </Card>

      {/* ========== Feedback (completed only) ========== */}
      {session.status === "completed" && feedback && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <Star className="size-4 text-amber-500" />
              <h3 className="text-sm font-medium text-foreground">
                Centre Feedback
              </h3>
            </div>

            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`size-5 ${
                    i < (feedback.rating ?? 0)
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
              <span className="ml-2 text-sm font-medium text-foreground">
                {feedback.rating ?? 0}/5
              </span>
            </div>

            {feedback.comment && (
              <p className="text-sm text-muted-foreground">{feedback.comment}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Swap dialog */}
      <SwapRequestDialog
        sessionId={session.id}
        currentCoachId={currentUserId}
        open={swapDialogOpen}
        onOpenChange={setSwapDialogOpen}
      />
    </div>
  );
}

// ============================================================
// Expandable programme content for coaches
// ============================================================

function CoachProgramContent({ programId }: { programId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<ProgramContentJson | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expanded && !content) {
      setLoading(true);
      getProgramById(programId).then(({ data }) => {
        if (data) {
          setContent(data.content_json as unknown as ProgramContentJson);
        }
        setLoading(false);
      });
    }
  }, [expanded, content, programId]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors min-h-[44px]"
      >
        {expanded ? (
          <ChevronUp className="size-3.5" />
        ) : (
          <ChevronDown className="size-3.5" />
        )}
        {expanded ? "Hide Session Plan" : "View Session Plan"}
      </button>

      {expanded && (
        <div className="mt-2">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Loading session plan…
            </p>
          ) : content ? (
            <ProgramView content={content} collapsible />
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Unable to load session plan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
