"use client";

import React, { useState, ChangeEvent } from "react";
import { toast } from "sonner";
import {
  MapPin, Phone, Users, ChevronDown, ChevronUp, Star,
  Camera, CheckCircle2, ClipboardList, Package, AlertCircle,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle,
  SheetFooter, SheetClose,
} from "@/components/ui/sheet";
import type { TodaySession, WeekDay, TodayChild } from "@/lib/launch/coach-dashboard-actions";
import {
  markAttendance,
  saveSessionNotes,
  uploadSessionPhoto,
  getExistingAttendance,
} from "@/lib/launch/coach-dashboard-actions";
import { submitOrQueue } from "@/lib/offline/submit-or-queue";

// ========================
// Time formatting
// ========================

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function formatDayShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

// ========================
// Main dashboard component
// ========================

export function CoachTodayDashboard({
  initialSessions,
  weekDays,
  coachId,
  nextSessionDate,
}: {
  initialSessions: TodaySession[];
  weekDays: WeekDay[];
  coachId: string;
  nextSessionDate: string | null;
}) {
  const [sessions, setSessions] = useState(initialSessions);

  const refreshSession = (sessionId: string, updates: Partial<TodaySession>) => {
    setSessions((prev: TodaySession[]) =>
      prev.map((s: TodaySession) => (s.sessionId === sessionId ? { ...s, ...updates } : s))
    );
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-8">
      {/* Today's Sessions */}
      <section>
        <h1 className="text-xl font-bold text-foreground mb-4">Today&apos;s Sessions</h1>

        {sessions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Calendar className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-muted-foreground font-medium">No sessions today</p>
              {nextSessionDate && (
                <p className="text-sm text-muted-foreground mt-1">
                  Next session: {formatDayShort(nextSessionDate)}
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map((session: TodaySession) => (
              <SessionCard
                key={session.sessionId}
                session={session}
                coachId={coachId}
                onUpdate={refreshSession}
              />
            ))}
          </div>
        )}
      </section>

      {/* This Week */}
      {weekDays.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">This Week</h2>
          <div className="space-y-3">
            {weekDays.map((day) => (
              <div key={day.date}>
                <p className="text-sm font-medium text-muted-foreground mb-1.5">
                  {day.dayLabel}
                </p>
                <div className="space-y-2">
                  {day.sessions.map((s) => (
                    <Card key={s.sessionId} className="border-muted">
                      <CardContent className="py-3 px-4 flex items-center justify-between min-h-[60px]">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {formatTime(s.startTime)} — {formatTime(s.endTime)}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {s.centreName} &bull; {s.sport}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <Badge variant="secondary" className="text-xs">
                            <Users className="h-3 w-3 mr-1" />
                            {s.childCount}
                          </Badge>
                          {s.status === "completed" && (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ========================
// Session Card
// ========================

function SessionCard({
  session,
  coachId,
  onUpdate,
}: {
  session: TodaySession;
  coachId: string;
  onUpdate: (sessionId: string, updates: Partial<TodaySession>) => void;
}) {
  const [equipExpanded, setEquipExpanded] = useState(false);
  const isCompleted = session.sessionCompleted || session.status === "completed";

  return (
    <Card className={isCompleted ? "border-green-200 bg-green-50/50" : ""}>
      <CardContent className="py-4 px-4 space-y-3">
        {/* Time + Status */}
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-brand-orange">
            {formatTime(session.startTime)} — {formatTime(session.endTime)}
          </p>
          {isCompleted && (
            <Badge className="bg-green-600 text-white">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Completed
            </Badge>
          )}
        </div>

        {/* Centre name */}
        <div>
          <p className="text-lg font-bold leading-tight">{session.centreName}</p>
          <p className="text-sm text-muted-foreground">{session.sport}</p>
        </div>

        {/* Address */}
        {session.address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(session.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2 text-sm text-brand-orange hover:underline min-h-[44px] py-2"
          >
            <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{session.address}</span>
          </a>
        )}

        {/* Children count */}
        <Badge variant="secondary" className="text-sm">
          <Users className="h-3.5 w-3.5 mr-1.5" />
          {session.childCount} children expected
        </Badge>

        {/* Contact */}
        {session.contactName && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{session.contactName}</span>
            {session.contactPhone && (
              <a
                href={`tel:${session.contactPhone}`}
                className="text-brand-orange font-medium hover:underline min-h-[44px] flex items-center"
              >
                {session.contactPhone}
              </a>
            )}
          </div>
        )}

        {/* Equipment */}
        {session.equipmentItems.length > 0 && (
          <div>
            <button
              onClick={() => setEquipExpanded(!equipExpanded)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
            >
              <Package className="h-4 w-4" />
              <span>Equipment ({session.equipmentItems.length} items)</span>
              {equipExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {equipExpanded && (
              <ul className="mt-1 ml-6 text-sm text-muted-foreground space-y-0.5">
                {session.equipmentItems.map((item, i) => (
                  <li key={i}>&bull; {item}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Admin notes */}
        {session.notes && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-amber-900">{session.notes}</p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!isCompleted && (
          <div className="flex gap-2 pt-1">
            <AttendanceSheetButton
              session={session}
              coachId={coachId}
              onSaved={() => onUpdate(session.sessionId, { attendanceMarked: true })}
            />
            <CompletionSheetButton
              session={session}
              coachId={coachId}
              disabled={!session.attendanceMarked}
              onCompleted={() =>
                onUpdate(session.sessionId, {
                  sessionCompleted: true,
                  status: "completed",
                })
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ========================
// Attendance Sheet
// ========================

function AttendanceSheetButton({
  session,
  coachId,
  onSaved,
}: {
  session: TodaySession;
  coachId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [walkIns, setWalkIns] = useState<Array<{ childName: string; parentName: string; parentPhone: string }>>([]);
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInParent, setWalkInParent] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !loaded) {
      // Load existing attendance
      const { data } = await getExistingAttendance(session.sessionId);
      const existing: Record<string, boolean> = {};
      for (const r of data) {
        existing[r.childId] = r.status === "present" || r.status === "walk_in";
      }
      // If no existing, default all unchecked
      if (data.length === 0) {
        for (const child of session.children) {
          existing[child.id] = false;
        }
      }
      setAttendance(existing);
      setLoaded(true);
    }
  };

  const markAllPresent = () => {
    const updated: Record<string, boolean> = {};
    for (const child of session.children) {
      updated[child.id] = true;
    }
    setAttendance(updated);
  };

  const addWalkIn = () => {
    if (!walkInName.trim()) return;
    setWalkIns([...walkIns, {
      childName: walkInName.trim(),
      parentName: walkInParent.trim(),
      parentPhone: walkInPhone.trim(),
    }]);
    setWalkInName("");
    setWalkInParent("");
    setWalkInPhone("");
    setShowWalkInForm(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const records = session.children.map((c) => ({
      childId: c.id,
      status: (attendance[c.id] ? "present" : "absent") as "present" | "absent",
    }));

    const payload = {
      sessionId: session.sessionId,
      coachId,
      attendanceRecords: records,
      walkIns: walkIns.length > 0 ? walkIns : undefined,
    };
    const result = await submitOrQueue("attendance", payload, async (p) => {
      const r = await markAttendance(p);
      return { error: r.success ? null : (r.error ?? "Attendance failed") };
    });

    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.queued) {
      toast.success("Saved offline — will sync when you reconnect.", {
        icon: "🟠",
      });
    } else {
      toast.success("Attendance saved");
    }
    setOpen(false);
    onSaved();
  };

  const presentCount = Object.values(attendance).filter(Boolean).length + walkIns.length;

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger
        render={
          <Button
            variant={session.attendanceMarked ? "secondary" : "default"}
            className="flex-1 min-h-[44px]"
          />
        }
      >
        <ClipboardList className="h-4 w-4 mr-2" />
        {session.attendanceMarked ? "Edit Attendance" : "Mark Attendance"}
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Attendance — {session.centreName}</SheetTitle>
        </SheetHeader>

        <div className="px-4 space-y-3">
          {/* Mark All */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {presentCount} / {session.children.length + walkIns.length} present
            </span>
            <Button variant="outline" size="sm" onClick={markAllPresent} className="min-h-[44px]">
              Mark All Present
            </Button>
          </div>

          {/* Child list */}
          <div className="divide-y">
            {session.children.map((child) => (
              <label
                key={child.id}
                className="flex items-center gap-3 py-3 min-h-[44px] cursor-pointer"
              >
                <Checkbox
                  checked={attendance[child.id] ?? false}
                  onCheckedChange={(checked: boolean) =>
                    setAttendance((prev: Record<string, boolean>) => ({ ...prev, [child.id]: checked === true }))
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {child.firstName} {child.lastName}
                  </p>
                  {child.medicalNotes && (
                    <p className="text-xs text-amber-600 truncate">
                      ⚕ {child.medicalNotes}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {child.ageGroup}
                </Badge>
              </label>
            ))}

            {/* Walk-ins */}
            {walkIns.map((wi: { childName: string; parentName: string; parentPhone: string }, i: number) => (
              <div key={`wi-${i}`} className="flex items-center gap-3 py-3 min-h-[44px]">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{wi.childName}</p>
                  <p className="text-xs text-muted-foreground">Walk-in &bull; {wi.parentName}</p>
                </div>
                <button
                  onClick={() => setWalkIns(walkIns.filter((_: unknown, j: number) => j !== i))}
                  className="text-xs text-red-500 min-h-[44px] flex items-center px-2"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {/* Walk-in form */}
          {showWalkInForm ? (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Add Walk-in</p>
              <Input
                placeholder="Child name"
                value={walkInName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setWalkInName(e.target.value)}
              />
              <Input
                placeholder="Parent name"
                value={walkInParent}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setWalkInParent(e.target.value)}
              />
              <Input
                placeholder="Parent phone"
                type="tel"
                value={walkInPhone}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setWalkInPhone(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={addWalkIn} disabled={!walkInName.trim()} className="min-h-[44px]">
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowWalkInForm(false)} className="min-h-[44px]">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full min-h-[44px]"
              onClick={() => setShowWalkInForm(true)}
            >
              + Add Walk-in
            </Button>
          )}
        </div>

        <SheetFooter>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full min-h-[44px]"
          >
            {saving ? "Saving..." : "Save Attendance"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ========================
// Session Completion Sheet
// ========================

function CompletionSheetButton({
  session,
  coachId,
  disabled,
  onCompleted,
}: {
  session: TodaySession;
  coachId: string;
  disabled: boolean;
  onCompleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");
  const [obsExpanded, setObsExpanded] = useState(false);
  const [observations, setObservations] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (rating === 0) {
      toast.error("Please rate the session");
      return;
    }

    setSaving(true);

    // Save notes first
    const childObs: Array<{ childId: string; observation: string }> = [];
    for (const [childId, obs] of Object.entries(observations)) {
      if ((obs as string).trim()) {
        childObs.push({ childId, observation: obs as string });
      }
    }

    const obsPayload = {
      sessionId: session.sessionId,
      coachId,
      generalNotes: notes || undefined,
      rating,
      childObservations: childObs.length > 0 ? childObs : undefined,
    };
    const result = await submitOrQueue("observation", obsPayload, async (p) => {
      const r = await saveSessionNotes(p);
      return { error: r.success ? null : (r.error ?? "Observation save failed") };
    });

    if (result.error) {
      setSaving(false);
      toast.error(result.error);
      return;
    }

    if (result.queued) {
      // Photo uploads need an online round-trip (FormData → storage) so we
      // skip them in offline mode — coach can attach them later from the
      // session detail view once they have signal.
      setSaving(false);
      toast.success("Saved offline — will sync when you reconnect.", {
        icon: "🟠",
      });
      setOpen(false);
      onCompleted();
      return;
    }

    // Online — upload photos as usual.
    for (const photo of photos) {
      const fd = new FormData();
      fd.append("sessionId", session.sessionId);
      fd.append("coachId", coachId);
      fd.append("file", photo);
      await uploadSessionPhoto(fd);
    }

    setSaving(false);
    toast.success("Session completed!");
    setOpen(false);
    onCompleted();
  };

  const addPhotos = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const remaining = 3 - photos.length;
    setPhotos([...photos, ...files.slice(0, remaining)]);
  };

  // Get present children for observations
  const presentChildren = session.children; // All children are shown, coach picks

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="secondary"
            className="flex-1 min-h-[44px]"
            disabled={disabled}
          />
        }
      >
        <CheckCircle2 className="h-4 w-4 mr-2" />
        Complete Session
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Complete Session</SheetTitle>
        </SheetHeader>

        <div className="px-4 space-y-5">
          {/* Star Rating */}
          <div>
            <p className="text-sm font-medium mb-2">How did this session go?</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= rating
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Session Notes */}
          <div>
            <label className="text-sm font-medium mb-1 block">Session notes</label>
            <Textarea
              placeholder="How did the session go? Any highlights or issues?"
              value={notes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Child Observations */}
          <div>
            <button
              onClick={() => setObsExpanded(!obsExpanded)}
              className="flex items-center gap-2 text-sm font-medium min-h-[44px]"
            >
              Child observations (optional)
              {obsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {obsExpanded && (
              <div className="mt-2 space-y-3">
                {presentChildren.map((child) => (
                  <div key={child.id}>
                    <label className="text-sm text-muted-foreground block mb-1">
                      {child.firstName} {child.lastName}
                    </label>
                    <Textarea
                      placeholder="Any observations..."
                      rows={2}
                      value={observations[child.id] || ""}
                      onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                        setObservations((prev: Record<string, string>) => ({ ...prev, [child.id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Photo Upload */}
          <div>
            <p className="text-sm font-medium mb-2">
              Photos ({photos.length}/3)
            </p>
            {photos.length > 0 && (
              <div className="flex gap-2 mb-2 flex-wrap">
                {photos.map((p: File, i: number) => (
                  <div key={i} className="relative">
                    <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground overflow-hidden">
                      <Camera className="h-5 w-5" />
                    </div>
                    <button
                      onClick={() => setPhotos(photos.filter((_: File, j: number) => j !== i))}
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {photos.length < 3 && (
              <label className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/20 py-4 cursor-pointer hover:border-muted-foreground/40 transition-colors min-h-[44px]">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Add photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={addPhotos}
                />
              </label>
            )}
          </div>
        </div>

        <SheetFooter>
          <Button
            onClick={handleSave}
            disabled={saving || rating === 0}
            className="w-full min-h-[44px]"
          >
            {saving ? "Completing..." : "Complete Session"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
