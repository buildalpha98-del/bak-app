"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronUp,
  Users,
  Timer,
  Check,
  Plus,
  Loader2,
  Hash,
} from "lucide-react";
import { sportColour } from "@/lib/utils/sport-colours";
import { ProgramContent } from "./program-content";
import { EndSessionDialog } from "./end-session-dialog";
import { SyncIndicator } from "./sync-indicator";
import { saveSessionProgress } from "@/lib/sessions/session-workflow-actions";
import { quickAddChild } from "@/lib/children/actions";
import { queueAction } from "@/lib/offline/sessionQueue";
import { toast } from "sonner";
import type { ActiveSessionData, AttendanceEntry } from "@/lib/sessions/session-workflow-actions";
import type { AgeGroup } from "@/lib/types/enums";

// ============================================================
// Props
// ============================================================

interface ActiveSessionViewProps {
  data: ActiveSessionData;
}

// ============================================================
// Timer hook
// ============================================================

function useElapsedTimer(startedAt: string | null) {
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    if (!startedAt) return;

    function update() {
      const start = new Date(startedAt!).getTime();
      const diff = Math.max(0, Date.now() - start);
      const totalSec = Math.floor(diff / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;

      if (h > 0) {
        setElapsed(
          `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        );
      } else {
        setElapsed(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return elapsed;
}

// ============================================================
// Component
// ============================================================

export function ActiveSessionView({ data }: ActiveSessionViewProps) {
  const { session, centre_name, school_class_label, centre_children, program } = data;
  const colour = sportColour(session.sport);
  const elapsed = useElapsedTimer(session.started_at);

  const [programExpanded, setProgramExpanded] = useState(true);
  const [notes, setNotes] = useState(session.coach_notes ?? "");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">(
    "idle"
  );

  // Named attendance state
  const [attendanceMode, setAttendanceMode] = useState<"named" | "headcount">(
    centre_children.length > 0 ? "named" : "headcount"
  );
  const [presentSet, setPresentSet] = useState<Set<string>>(new Set());
  const [childrenList, setChildrenList] = useState(centre_children);
  const [headcount, setHeadcount] = useState(session.headcount ?? 0);

  // Quick-add state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickFirstName, setQuickFirstName] = useState("");
  const [quickLastName, setQuickLastName] = useState("");
  const [quickAgeGroup, setQuickAgeGroup] = useState<AgeGroup>("5-8");
  const [isAddingChild, startAddingChild] = useTransition();

  // Derived headcount from named attendance
  const namedHeadcount = presentSet.size;
  const effectiveHeadcount =
    attendanceMode === "named" ? namedHeadcount : headcount;

  // Refs for auto-save debouncing
  const headcountRef = useRef(effectiveHeadcount);
  const notesRef = useRef(notes);
  headcountRef.current = effectiveHeadcount;
  notesRef.current = notes;

  // Auto-save function
  const autoSave = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const result = await saveSessionProgress(session.id, {
        headcount: headcountRef.current,
        coach_notes: notesRef.current,
      });
      if (result.error) {
        await queueAction({
          type: "save_progress",
          sessionId: session.id,
          payload: {
            headcount: headcountRef.current,
            coach_notes: notesRef.current,
          },
        });
      }
      setSaveStatus("saved");
    } catch {
      await queueAction({
        type: "save_progress",
        sessionId: session.id,
        payload: {
          headcount: headcountRef.current,
          coach_notes: notesRef.current,
        },
      });
      setSaveStatus("saved");
    }
  }, [session.id]);

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(autoSave, 30_000);
    return () => clearInterval(interval);
  }, [autoSave]);

  // Debounced save on notes change
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (notes !== (session.coach_notes ?? "")) {
        autoSave();
      }
    }, 5000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  // Save on headcount change (headcount-only mode)
  useEffect(() => {
    if (attendanceMode === "headcount" && headcount !== (session.headcount ?? 0)) {
      const timeout = setTimeout(autoSave, 2000);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headcount, attendanceMode]);

  // Toggle child presence
  function toggleChild(childId: string) {
    setPresentSet((prev) => {
      const next = new Set(prev);
      if (next.has(childId)) {
        next.delete(childId);
      } else {
        next.add(childId);
      }
      return next;
    });
  }

  // Quick-add child handler
  function handleQuickAdd() {
    if (!quickFirstName.trim() || !quickLastName.trim()) {
      toast.error("First and last name are required.");
      return;
    }

    startAddingChild(async () => {
      const result = await quickAddChild(
        quickFirstName.trim(),
        quickLastName.trim(),
        quickAgeGroup,
        session.centre_id
      );

      if (result.error || !result.data) {
        toast.error(result.error ?? "Failed to add child.");
        return;
      }

      // Add to local list and mark present
      const newChild = {
        id: result.data.id,
        first_name: quickFirstName.trim(),
        last_name: quickLastName.trim(),
        age_group: quickAgeGroup,
      };
      setChildrenList((prev) => [...prev, newChild]);
      setPresentSet((prev) => new Set(prev).add(result.data!.id));

      // Reset form
      setQuickFirstName("");
      setQuickLastName("");
      setShowQuickAdd(false);
      toast.success(`${newChild.first_name} added and marked present.`);
    });
  }

  // Build attendance entries for session completion
  const attendanceEntries: AttendanceEntry[] =
    attendanceMode === "named"
      ? childrenList.map((c) => ({
          child_id: c.id,
          present: presentSet.has(c.id),
        }))
      : [];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ========== Sticky top bar ========== */}
      <div className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Timer className="size-4 text-primary" />
              <span className="text-lg font-bold tabular-nums text-primary">
                {elapsed}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: colour }}
              />
              <span className="text-sm font-medium text-foreground truncate max-w-[120px]">
                {session.sport}
              </span>
            </div>
          </div>

          <EndSessionDialog
            sessionId={session.id}
            headcount={effectiveHeadcount}
            attendanceEntries={attendanceEntries}
            programActivities={
              program
                ? Object.values(program.content_json)
                    .filter((v) => typeof v === "string")
                    .join("; ")
                : undefined
            }
          />
        </div>
        <p className="mx-auto max-w-lg mt-0.5 text-xs text-muted-foreground truncate">
          {centre_name}
          {school_class_label ? ` — ${school_class_label}` : ""}
        </p>
      </div>

      {/* ========== Scrollable body ========== */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-lg space-y-4">
          {/* Programme plan */}
          <Card>
            <CardHeader className="pb-2">
              <button
                type="button"
                onClick={() => setProgramExpanded(!programExpanded)}
                className="flex w-full items-center justify-between"
              >
                <CardTitle className="text-base">Programme Plan</CardTitle>
                {programExpanded ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </button>
            </CardHeader>
            {programExpanded && (
              <CardContent>
                {program ? (
                  <ProgramContent
                    contentJson={program.content_json}
                    sport={session.sport}
                  />
                ) : (
                  <div className="py-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      No programme linked to this session.
                    </p>
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          {/* Attendance */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="size-4" />
                  Attendance
                  {attendanceMode === "named" && (
                    <Badge variant="secondary" className="text-xs">
                      {namedHeadcount} present
                    </Badge>
                  )}
                </CardTitle>
                {/* Mode toggle */}
                <button
                  type="button"
                  onClick={() =>
                    setAttendanceMode(
                      attendanceMode === "named" ? "headcount" : "named"
                    )
                  }
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {attendanceMode === "named" ? (
                    <>
                      <Hash className="size-3" />
                      Headcount only
                    </>
                  ) : (
                    <>
                      <Users className="size-3" />
                      Named attendance
                    </>
                  )}
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {attendanceMode === "headcount" ? (
                /* ========== Headcount mode (original) ========== */
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setHeadcount(Math.max(0, headcount - 1))}
                    className="flex size-12 items-center justify-center rounded-full border-2 border-border text-xl font-bold text-muted-foreground active:bg-secondary transition-colors"
                    aria-label="Decrease headcount"
                  >
                    −
                  </button>
                  <div className="flex flex-col items-center">
                    <span className="text-4xl font-bold tabular-nums text-foreground">
                      {headcount}
                    </span>
                    <span className="text-xs text-muted-foreground">children</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHeadcount(headcount + 1)}
                    className="flex size-12 items-center justify-center rounded-full border-2 border-primary text-xl font-bold text-primary active:bg-orange-50 transition-colors"
                    aria-label="Increase headcount"
                  >
                    +
                  </button>
                </div>
              ) : (
                /* ========== Named attendance mode ========== */
                <div className="space-y-1">
                  {childrenList.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No children enrolled at this centre yet.
                    </p>
                  ) : (
                    childrenList.map((child) => {
                      const isPresent = presentSet.has(child.id);
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => toggleChild(child.id)}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
                            isPresent
                              ? "bg-green-50 border border-green-200"
                              : "bg-card border border-border hover:bg-secondary/50"
                          }`}
                          style={{ minHeight: 44 }}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`flex size-6 items-center justify-center rounded-full transition-colors ${
                                isPresent
                                  ? "bg-green-500 text-white"
                                  : "border-2 border-border"
                              }`}
                            >
                              {isPresent && <Check className="size-3.5" />}
                            </div>
                            <span
                              className={`text-sm font-medium ${
                                isPresent
                                  ? "text-green-900"
                                  : "text-foreground"
                              }`}
                            >
                              {child.first_name} {child.last_name}
                            </span>
                          </div>
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5"
                          >
                            {child.age_group}
                          </Badge>
                        </button>
                      );
                    })
                  )}

                  {/* Quick-add child */}
                  {showQuickAdd ? (
                    <div className="mt-2 space-y-2 rounded-lg border border-dashed border-primary/30 bg-orange-50/50 p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="First name"
                          value={quickFirstName}
                          onChange={(e) => setQuickFirstName(e.target.value)}
                          className="min-h-[44px]"
                          autoFocus
                        />
                        <Input
                          placeholder="Last name"
                          value={quickLastName}
                          onChange={(e) => setQuickLastName(e.target.value)}
                          className="min-h-[44px]"
                        />
                      </div>
                      <Select
                        value={quickAgeGroup}
                        onValueChange={(v) => setQuickAgeGroup(v as AgeGroup)}
                      >
                        <SelectTrigger className="min-h-[44px]">
                          <SelectValue placeholder="Age group" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3-5">3–5 years</SelectItem>
                          <SelectItem value="5-8">5–8 years</SelectItem>
                          <SelectItem value="8-12">8–12 years</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="min-h-[44px] flex-1"
                          onClick={() => {
                            setShowQuickAdd(false);
                            setQuickFirstName("");
                            setQuickLastName("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="min-h-[44px] flex-1 bg-primary text-white hover:bg-primary/90"
                          onClick={handleQuickAdd}
                          disabled={isAddingChild}
                        >
                          {isAddingChild ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <>
                              <Plus className="size-4" />
                              Add & Mark Present
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowQuickAdd(true)}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      style={{ minHeight: 44 }}
                    >
                      <Plus className="size-4" />
                      Add New Child
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Session Notes</CardTitle>
                {saveStatus === "saving" && (
                  <span className="text-xs text-muted-foreground">Saving…</span>
                )}
                {saveStatus === "saved" && (
                  <span className="text-xs text-green-600">Saved</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes during the session…"
                rows={4}
                className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ========== Bottom sync indicator ========== */}
      <div className="sticky bottom-0 flex justify-center border-t bg-card/95 backdrop-blur-sm px-4 py-2">
        <SyncIndicator />
      </div>
    </div>
  );
}
