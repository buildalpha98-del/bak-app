"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Clock,
  CalendarDays,
  DollarSign,
  UserCircle,
  Sparkles,
  Loader2,
  ShieldAlert,
  Trophy,
  Star,
  BookOpen,
  Trash2,
  Pencil,
  Lock,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SessionStatusBadge } from "./session-status-badge";
import { VarianceBadge } from "./variance-badge";
import {
  CoachChipMultiselect,
  type ChipCoach,
} from "./coach-chip-multiselect";
import { ReplacementPanel } from "./replacement-panel";
import { SessionNotesPopover } from "./session-notes-popover";
import { SessionAttendanceList } from "@/components/attendance/session-attendance-list";
import { formatDateShort, formatTime12 } from "@/lib/utils/roster";
import { toast } from "sonner";
import {
  updateSessionStatus,
  updateSession,
  deleteSession,
  assignCoaches,
} from "@/lib/sessions/actions";
import { getReplacementSuggestions } from "@/lib/sessions/scheduling-actions";
import {
  getProgramsForSport,
  assignProgramToSession,
} from "@/lib/programs/actions";
import type { ProgramListItem } from "@/lib/programs/actions";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import type { SessionStatus } from "@/lib/types/enums";
import type { Centre, Profile } from "@/lib/types/database";
import type { ReplacementSuggestion } from "@/lib/utils/scheduling";
import {
  describeSessionCertWarning,
  type SessionCertWarning,
} from "@/lib/utils/compliance/cert-warnings";

// ============================================================
// Status action config
// ============================================================

const STATUS_ACTIONS: Record<
  SessionStatus,
  { label: string; nextStatus: SessionStatus } | null
> = {
  draft: { label: "Publish", nextStatus: "published" },
  published: {
    label: "Send for Confirmation",
    nextStatus: "pending_confirmation",
  },
  pending_confirmation: { label: "Mark Confirmed", nextStatus: "confirmed" },
  confirmed: { label: "Start Session", nextStatus: "in_progress" },
  in_progress: { label: "Complete Session", nextStatus: "completed" },
  completed: null,
  cancelled: null,
  needs_replacement: null,
};

// ============================================================
// Props
// ============================================================

interface SessionDetailSheetProps {
  session: SessionWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  centres: Pick<Centre, "id" | "name">[];
  coaches: Pick<Profile, "id" | "name">[];
  onUpdate: () => void;
  /** Per-session cert warnings keyed by session_id */
  sessionCertWarnings?: Record<string, SessionCertWarning>;
  /**
   * When false, the Pay Rate section renders a small Lock chip
   * instead of revealing rate / override values. Plumbed from the
   * page-level `getFinancialAccess()` call so the gate matches
   * `WeekCostChip` and the `/admin/payroll` route.
   */
  financialAccess?: boolean;
}

// ============================================================
// Component
// ============================================================

export function SessionDetailSheet({
  session,
  open,
  onOpenChange,
  coaches,
  onUpdate,
  sessionCertWarnings,
  financialAccess = false,
}: SessionDetailSheetProps) {
  const [saving, setSaving] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // Pay rate override
  const [editingRate, setEditingRate] = useState(false);
  const [rateOverride, setRateOverride] = useState("");

  // Replacement suggestions
  const [replacements, setReplacements] = useState<ReplacementSuggestion[]>([]);
  const [loadingReplacements, setLoadingReplacements] = useState(false);

  // Programme assignment
  const [assigningProgram, setAssigningProgram] = useState(false);
  const [sportPrograms, setSportPrograms] = useState<ProgramListItem[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);

  // Rerostering event (for needs_replacement sessions)
  const [rerosteringEvent, setRerosteringEvent] = useState<Record<string, unknown> | null>(null);
  const [loadingRerostering, setLoadingRerostering] = useState(false);

  useEffect(() => {
    if (session?.status === "needs_replacement" && open) {
      setLoadingRerostering(true);
      import("@/lib/rerostering/actions").then(({ getActiveRerosteringEvents }) => {
        getActiveRerosteringEvents().then((events) => {
          const match = events.find(
            (e: Record<string, unknown>) => e.session_id === session.id
          );
          setRerosteringEvent(match ?? null);
          setLoadingRerostering(false);
        });
      });
    }
  }, [session?.id, session?.status, open]);

  if (!session) return null;

  const statusAction = STATUS_ACTIONS[session.status];
  const isTerminal =
    session.status === "completed" || session.status === "cancelled";

  // Per-session cert warning (blocked or expiring within 14 days)
  const certWarning = sessionCertWarnings?.[session.id];
  const isBlocked = (certWarning?.blocked.length ?? 0) > 0;

  async function handleStatusChange(nextStatus: SessionStatus) {
    setSaving(true);
    const { error } = await updateSessionStatus(session!.id, nextStatus);
    setSaving(false);
    if (!error) {
      onUpdate();
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setSaving(true);
    const { error } = await updateSessionStatus(
      session!.id,
      "cancelled",
      cancelReason.trim()
    );
    setSaving(false);
    if (!error) {
      setShowCancel(false);
      setCancelReason("");
      onUpdate();
    }
  }

  async function handleDelete() {
    setSaving(true);
    const { error } = await deleteSession(session!.id);
    setSaving(false);
    if (!error) {
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onUpdate();
    }
  }

  async function handleAssignCoaches(next: ChipCoach[]) {
    setSaving(true);
    const { error } = await assignCoaches(
      session!.id,
      next.map((c, i) => ({ userId: c.id, isPrimary: i === 0 }))
    );
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Coaches updated.");
    onUpdate();
  }

  async function handleReplacementPick(coachId: string) {
    // Replacement suggestions are single-pick (legacy primary swap).
    // Route through assignCoaches so the cert guard + activity log fire.
    const name =
      replacements.find((r) => r.coachId === coachId)?.coachName ??
      coaches.find((c) => c.id === coachId)?.name ??
      "(unknown)";
    await handleAssignCoaches([{ id: coachId, name }]);
  }

  async function handleSaveRate() {
    setSaving(true);
    const value = rateOverride ? parseFloat(rateOverride) : null;
    const { error } = await updateSession(session!.id, {
      pay_rate_override: value,
    });
    setSaving(false);
    if (!error) {
      setEditingRate(false);
      onUpdate();
    }
  }

  async function handleLoadReplacements() {
    setLoadingReplacements(true);
    const { data } = await getReplacementSuggestions(session!.id);
    setReplacements(data ?? []);
    setLoadingReplacements(false);
  }

  async function handleStartProgramAssign() {
    setAssigningProgram(true);
    setLoadingPrograms(true);
    const { data } = await getProgramsForSport(session!.sport);
    setSportPrograms(data ?? []);
    setLoadingPrograms(false);
  }

  async function handleAssignProgram(programId: string) {
    setSaving(true);
    const pid = programId === "none" ? null : programId;
    const { error } = await assignProgramToSession(session!.id, pid);
    setSaving(false);
    if (!error) {
      setAssigningProgram(false);
      onUpdate();
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between pr-8">
            <div>
              <SheetTitle>{session.centre_name}</SheetTitle>
              <SheetDescription>
                {formatDateShort(session.date)} ·{" "}
                {formatTime12(session.time.slice(0, 5))}
              </SheetDescription>
            </div>
            <SessionStatusBadge status={session.status} />
          </div>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-4">
          {/* Per-session cert warning banner */}
          {certWarning && (certWarning.blocked.length > 0 || certWarning.expiring.length > 0) && (
            <div
              className={`flex items-start gap-2 rounded-lg border p-3 ${
                isBlocked
                  ? "border-red-200 bg-red-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <ShieldAlert
                className={`mt-0.5 size-4 shrink-0 ${
                  isBlocked ? "text-red-600" : "text-amber-600"
                }`}
              />
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${
                    isBlocked ? "text-red-700" : "text-amber-700"
                  }`}
                >
                  {isBlocked
                    ? "Coach blocked from this session"
                    : "Cert expires soon"}
                </p>
                <p
                  className={`text-xs ${
                    isBlocked ? "text-red-600" : "text-amber-600"
                  }`}
                >
                  {describeSessionCertWarning(certWarning)}
                </p>
              </div>
            </div>
          )}

          {/* Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="size-4" />
                <span>{session.sport}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-4" />
                <span>{session.duration_minutes} minutes</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-4" />
                <span className="capitalize">{session.centre_type.replace("_", " ")}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs">Term:</span>
                <span>{session.term_name}</span>
              </div>
            </div>
          </div>

          {/* Time clock — only shown once a session has been started */}
          {(session.started_at || session.completed_at) && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">
                    Time clock
                  </h3>
                  <VarianceBadge
                    date={session.date}
                    time={session.time}
                    durationMinutes={session.duration_minutes}
                    startedAt={session.started_at}
                    completedAt={session.completed_at}
                    size="sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                  <div>
                    <p className="text-xs">Scheduled</p>
                    <p>{formatTime12(session.time.slice(0, 5))}</p>
                  </div>
                  <div>
                    <p className="text-xs">Started</p>
                    <p>
                      {session.started_at
                        ? new Date(session.started_at).toLocaleTimeString(
                            "en-AU",
                            { hour: "numeric", minute: "2-digit", hour12: true },
                          )
                        : "—"}
                    </p>
                  </div>
                  {session.completed_at && (
                    <div>
                      <p className="text-xs">Completed</p>
                      <p>
                        {new Date(session.completed_at).toLocaleTimeString(
                          "en-AU",
                          { hour: "numeric", minute: "2-digit", hour12: true },
                        )}
                      </p>
                    </div>
                  )}
                  {session.actual_duration_minutes != null && (
                    <div>
                      <p className="text-xs">Actual duration</p>
                      <p>
                        {session.actual_duration_minutes} min
                        {session.actual_duration_minutes !==
                          session.duration_minutes && (
                          <span className="ml-1 text-xs italic">
                            (sched. {session.duration_minutes})
                          </span>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Notes</h3>
              <SessionNotesPopover
                open={notesOpen}
                onOpenChange={setNotesOpen}
                sessionId={session.id}
                initialNotes={session.notes}
                onSaved={() => {
                  setNotesOpen(false);
                  onUpdate();
                }}
              >
                <Button variant="ghost" size="sm" onClick={() => setNotesOpen(true)}>
                  <Pencil className="mr-1 h-3 w-3" />
                  {session.notes ? "Edit" : "Add"}
                </Button>
              </SessionNotesPopover>
            </div>
            {session.notes ? (
              <p className="whitespace-pre-wrap rounded bg-secondary/40 p-3 text-sm">
                {session.notes}
              </p>
            ) : (
              <p className="text-xs italic text-muted-foreground">No notes for this shift.</p>
            )}
          </div>

          <Separator />

          {/* Programme */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Programme</h3>
              {!isTerminal && !assigningProgram && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStartProgramAssign}
                >
                  {session.program_id ? "Change" : "Assign"}
                </Button>
              )}
            </div>

            {assigningProgram ? (
              <div className="space-y-2">
                {loadingPrograms ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading programmes…
                  </div>
                ) : sportPrograms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No {session.sport} programmes available.
                  </p>
                ) : (
                  <Select
                    value={session.program_id ?? "none"}
                    onValueChange={(v) => v && handleAssignProgram(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a programme…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No programme</SelectItem>
                      {sportPrograms.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="truncate">{p.title}</span>
                          {p.age_group && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({p.age_group})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAssigningProgram(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <BookOpen className="size-5 text-muted-foreground" />
                <span
                  className={`text-sm ${
                    session.program_id
                      ? "text-foreground"
                      : "italic text-muted-foreground"
                  }`}
                >
                  {session.program_id ? (session.program_title ?? "Programme assigned") : "No programme assigned"}
                </span>
              </div>
            )}
          </div>

          <Separator />

          {/* Coaches */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Coaches</h3>
            </div>

            {!isTerminal ? (
              <div className="space-y-3">
                {/* Chip multiselect — primary first, drag-to-reorder. */}
                <CoachChipMultiselect
                  value={(session.assigned_coaches ?? []).map((c) => ({
                    id: c.user_id,
                    name: c.name ?? "(unknown)",
                    // Active coaches list is filtered server-side
                    // (getActiveCoaches). Anyone still in `assigned_coaches`
                    // but missing from the active list is archived.
                    inactive: !coaches.some((opt) => opt.id === c.user_id),
                  }))}
                  options={coaches.map((c) => ({
                    id: c.id,
                    name: c.name,
                    inactive: false,
                  }))}
                  onChange={handleAssignCoaches}
                  disabled={saving}
                />

                <Separator />

                {/* Replacement Suggestions — single-pick primary swap. */}
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLoadReplacements}
                    disabled={loadingReplacements || saving}
                  >
                    {loadingReplacements ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {loadingReplacements
                      ? "Ranking coaches..."
                      : "Suggest Replacements"}
                  </Button>

                  {replacements.length > 0 && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Top suggestions (ranked by fit)
                      </p>
                      {replacements.map((r, i) => (
                        <button
                          key={r.coachId}
                          type="button"
                          disabled={saving}
                          className="flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => handleReplacementPick(r.coachId)}
                        >
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-orange-light)] text-xs font-semibold text-primary">
                            {i + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {r.coachName}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {r.score}/100
                              </Badge>
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {r.reasons.map((reason, j) => (
                                <span
                                  key={j}
                                  className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
                                >
                                  {reason.includes("sport") ? (
                                    <Trophy className="size-2.5" />
                                  ) : reason.includes("available") ? (
                                    <Star className="size-2.5" />
                                  ) : null}
                                  {reason}
                                  {j < r.reasons.length - 1 && " ·"}
                                </span>
                              ))}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {(session.assigned_coaches ?? []).length === 0 ? (
                  <div className="flex items-center gap-2">
                    <UserCircle className="size-5 text-muted-foreground" />
                    <span className="text-sm italic text-amber-600">
                      Unassigned
                    </span>
                  </div>
                ) : (
                  (session.assigned_coaches ?? []).map((c) => (
                    <div key={c.user_id} className="flex items-center gap-2">
                      <UserCircle className="size-5 text-muted-foreground" />
                      <span className="text-sm text-foreground">
                        {c.name ?? "(unknown)"}
                        {c.is_primary ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (primary)
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Pay Rate — gated behind financial_access. Without the
              flag we render a small Lock chip so the operator still
              sees the section heading (predictable layout) but no
              monetary detail leaks. */}
          {financialAccess ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Pay Rate</h3>
                {!isTerminal && !editingRate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRateOverride(
                        session.pay_rate_override?.toString() ?? ""
                      );
                      setEditingRate(true);
                    }}
                  >
                    Override
                  </Button>
                )}
              </div>

              {editingRate ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="size-4 text-muted-foreground" />
                    <Input
                      id="pay-rate-override"
                      type="number"
                      value={rateOverride}
                      onChange={(e) => setRateOverride(e.target.value)}
                      placeholder="Override rate"
                      className="w-32"
                      aria-label="Pay rate override"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={handleSaveRate}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingRate(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="size-4" />
                  {session.pay_rate_override != null ? (
                    <span>
                      ${session.pay_rate_override.toFixed(2)}{" "}
                      <span className="text-xs text-muted-foreground">
                        (override)
                      </span>
                    </span>
                  ) : session.pay_rate_resolved != null ? (
                    <span>${session.pay_rate_resolved.toFixed(2)}</span>
                  ) : (
                    <span className="italic">Not set</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Pay Rate</h3>
              <div className="flex items-center gap-2 rounded-2xl border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Lock className="size-3.5" />
                Financial visibility is restricted on this account.
              </div>
            </div>
          )}

          {/* Attendance (completed sessions only) */}
          {session.status === "completed" && (
            <>
              <Separator />
              <SessionAttendanceList
                sessionId={session.id}
                headcount={session.headcount}
              />
            </>
          )}

          <Separator />

          {/* Status Controls */}
          {!isTerminal && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Actions</h3>
              <div className="flex flex-col gap-2">
                {statusAction && (
                  <Button
                    onClick={() =>
                      handleStatusChange(statusAction.nextStatus)
                    }
                    disabled={saving}
                  >
                    {statusAction.label}
                  </Button>
                )}

                {!showCancel ? (
                  <Button
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setShowCancel(true)}
                    disabled={saving}
                  >
                    Cancel Session
                  </Button>
                ) : (
                  <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <Label className="text-sm text-red-700">
                      Cancellation Reason
                    </Label>
                    <Textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Enter reason for cancellation..."
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={!cancelReason.trim() || saving}
                        onClick={handleCancel}
                      >
                        Confirm Cancel
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowCancel(false);
                          setCancelReason("");
                        }}
                      >
                        Go Back
                      </Button>
                    </div>
                  </div>
                )}

                {/* Delete — draft sessions only */}
                {session.status === "draft" && (
                  <>
                    {!showDeleteConfirm ? (
                      <Button
                        variant="outline"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={saving}
                      >
                        <Trash2 className="mr-1.5 size-4" />
                        Delete Session
                      </Button>
                    ) : (
                      <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="text-sm font-medium text-red-700">
                          Are you sure? This cannot be undone.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={saving}
                            onClick={handleDelete}
                          >
                            <Trash2 className="mr-1.5 size-4" />
                            Delete Permanently
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowDeleteConfirm(false)}
                          >
                            Go Back
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Cancellation info for cancelled sessions */}
          {session.status === "cancelled" && session.cancellation_reason && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-medium text-red-700">
                Cancellation Reason
              </p>
              <p className="mt-1 text-sm text-red-600">
                {session.cancellation_reason}
              </p>
            </div>
          )}

          {/* Replacement panel for needs_replacement sessions */}
          {session.status === "needs_replacement" && (
            <>
              <Separator />
              {loadingRerostering ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading replacement options...
                </div>
              ) : rerosteringEvent ? (
                <ReplacementPanel
                  event={rerosteringEvent as any}
                  originalCoachName={
                    (rerosteringEvent.original_coach as any)?.name ?? undefined
                  }
                  sessionDate={session.date}
                  sessionTime={session.time}
                />
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm text-amber-700">
                    This session needs a replacement coach. No rerostering event
                    found.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
