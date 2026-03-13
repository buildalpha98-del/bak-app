"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Users, Timer } from "lucide-react";
import { sportColour } from "@/lib/utils/sport-colours";
import { ProgramContent } from "./program-content";
import { EndSessionDialog } from "./end-session-dialog";
import { SyncIndicator } from "./sync-indicator";
import { saveSessionProgress } from "@/lib/sessions/session-workflow-actions";
import { queueAction } from "@/lib/offline/sessionQueue";
import type { ActiveSessionData } from "@/lib/sessions/session-workflow-actions";

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
  const { session, centre_name, program } = data;
  const colour = sportColour(session.sport);
  const elapsed = useElapsedTimer(session.started_at);

  const [programExpanded, setProgramExpanded] = useState(true);
  const [headcount, setHeadcount] = useState(session.headcount ?? 0);
  const [notes, setNotes] = useState(session.coach_notes ?? "");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">(
    "idle"
  );

  // Refs for auto-save debouncing
  const headcountRef = useRef(headcount);
  const notesRef = useRef(notes);
  headcountRef.current = headcount;
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
        // Offline fallback
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
      // Queue offline
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

  // Save on headcount change
  useEffect(() => {
    if (headcount !== (session.headcount ?? 0)) {
      const timeout = setTimeout(autoSave, 2000);
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headcount]);

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
            headcount={headcount}
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
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="size-4" />
                Attendance
              </CardTitle>
            </CardHeader>
            <CardContent>
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
