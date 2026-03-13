"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StarRating } from "./star-rating";
import {
  Square,
  Loader2,
  Camera,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  completeSession,
  uploadIncidentPhoto,
} from "@/lib/sessions/session-workflow-actions";
import type { CompleteSessionData } from "@/lib/sessions/session-workflow-actions";
import { toast } from "sonner";

// ============================================================
// Props
// ============================================================

interface EndSessionDialogProps {
  sessionId: string;
  headcount: number;
  programActivities?: string;
}

// ============================================================
// Component
// ============================================================

export function EndSessionDialog({
  sessionId,
  headcount,
  programActivities,
}: EndSessionDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"confirm" | "feedback">("confirm");

  // Feedback fields
  const [activities, setActivities] = useState(programActivities ?? "");
  const [engagement, setEngagement] = useState(0);
  const [observations, setObservations] = useState("");
  const [hasIncident, setHasIncident] = useState(false);

  // Incident fields
  const [childName, setChildName] = useState("");
  const [incidentDesc, setIncidentDesc] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [witnesses, setWitnesses] = useState("");
  const [severity, setSeverity] = useState<"minor" | "moderate" | "serious">(
    "minor"
  );
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [parentNotified, setParentNotified] = useState(false);
  const [staffNotified, setStaffNotified] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation
  const feedbackValid = engagement > 0;
  const incidentValid =
    !hasIncident ||
    (childName.trim() !== "" &&
      incidentDesc.trim() !== "" &&
      actionTaken.trim() !== "");

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (!isOpen) {
      setStep("confirm");
    }
  }

  async function handlePhotoUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (photoUrls.length >= 3) {
      toast.error("Maximum 3 photos allowed.");
      return;
    }

    setUploadingPhoto(true);
    const file = files[0];
    const formData = new FormData();
    formData.append("file", file);

    const result = await uploadIncidentPhoto(formData);
    if (result.error) {
      toast.error(result.error);
    } else if (result.data) {
      setPhotoUrls((prev) => [...prev, result.data!]);
    }
    setUploadingPhoto(false);
    // Clear input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit() {
    if (!feedbackValid || !incidentValid) return;

    startTransition(async () => {
      const data: CompleteSessionData = {
        headcount,
        activities_delivered: activities.trim(),
        engagement_rating: engagement,
        observations: observations.trim(),
        has_incident: hasIncident,
      };

      if (hasIncident) {
        data.incident = {
          child_name: childName.trim(),
          description: incidentDesc.trim(),
          action_taken: actionTaken.trim(),
          witnesses: witnesses.trim() || undefined,
          severity,
          photo_urls: photoUrls.length > 0 ? photoUrls : undefined,
          parent_notified: parentNotified,
          centre_staff_notified: staffNotified,
        };
      }

      const result = await completeSession(sessionId, data);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Session completed!");
        setOpen(false);
        router.push("/coach");
        router.refresh();
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            className="min-h-[44px] border-red-300 text-red-600 hover:bg-red-50"
          >
            <Square className="size-4" />
            End Session
          </Button>
        }
      />
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>
            {step === "confirm" ? "End Session?" : "Quick Feedback"}
          </SheetTitle>
        </SheetHeader>

        {/* Step 1: Confirmation */}
        {step === "confirm" && (
          <div className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to end this session? You&apos;ll be asked
              for a quick feedback before completing.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-[44px] flex-1"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="min-h-[44px] flex-1 bg-primary hover:bg-primary/90 text-white"
                onClick={() => setStep("feedback")}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Feedback form */}
        {step === "feedback" && (
          <div className="space-y-5 pt-4 pb-4">
            {/* Activities delivered */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Activities Delivered
              </label>
              <textarea
                value={activities}
                onChange={(e) => setActivities(e.target.value)}
                placeholder="What activities did you run?"
                rows={2}
                className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {/* Engagement rating */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Engagement Rating
              </label>
              <StarRating value={engagement} onChange={setEngagement} />
              {engagement === 0 && (
                <p className="text-xs text-red-500">Please select a rating</p>
              )}
            </div>

            {/* Observations */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Observations
              </label>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Any notes on the session, children, or environment"
                rows={2}
                className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {/* Incident toggle */}
            <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-600" />
                <span className="text-sm font-medium text-foreground">
                  Report an Incident
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hasIncident}
                onClick={() => setHasIncident(!hasIncident)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  hasIncident ? "bg-amber-500" : "bg-secondary"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-card shadow transition-transform ${
                    hasIncident ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Incident form (expanded) */}
            {hasIncident && (
              <div className="space-y-4 rounded-lg border-2 border-amber-200 bg-amber-50/50 p-4">
                <h4 className="text-sm font-semibold text-amber-800">
                  Incident Details
                </h4>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Child Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={incidentDesc}
                    onChange={(e) => setIncidentDesc(e.target.value)}
                    placeholder="Describe what happened"
                    rows={3}
                    className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Action Taken <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={actionTaken}
                    onChange={(e) => setActionTaken(e.target.value)}
                    placeholder="What was done in response"
                    rows={2}
                    className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Witnesses
                  </label>
                  <input
                    type="text"
                    value={witnesses}
                    onChange={(e) => setWitnesses(e.target.value)}
                    placeholder="Names of any witnesses"
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Severity <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={severity}
                    onChange={(e) =>
                      setSeverity(
                        e.target.value as "minor" | "moderate" | "serious"
                      )
                    }
                    className="w-full rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="minor">Minor</option>
                    <option value="moderate">Moderate</option>
                    <option value="serious">Serious</option>
                  </select>
                </div>

                {/* Photo upload */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">
                    Photos ({photoUrls.length}/3)
                  </label>
                  {photoUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {photoUrls.map((url, i) => (
                        <div
                          key={i}
                          className="relative size-16 rounded-lg border overflow-hidden"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`Incident photo ${i + 1}`}
                            className="size-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPhotoUrls((prev) =>
                                prev.filter((_, idx) => idx !== i)
                              )
                            }
                            className="absolute right-0.5 top-0.5 rounded-full bg-black/50 p-0.5"
                          >
                            <X className="size-3 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {photoUrls.length < 3 && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingPhoto}
                        onClick={() => fileInputRef.current?.click()}
                        className="min-h-[44px]"
                      >
                        {uploadingPhoto ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <>
                            <Camera className="size-4" />
                            Add Photo
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>

                {/* Notification toggles */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-foreground">
                      Parent notified
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={parentNotified}
                      onClick={() => setParentNotified(!parentNotified)}
                      className={`relative h-5 w-9 rounded-full transition-colors ${
                        parentNotified ? "bg-green-500" : "bg-secondary"
                      }`}
                    >
                      <span
                        className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-card shadow transition-transform ${
                          parentNotified ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-foreground">
                      Centre staff notified
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={staffNotified}
                      onClick={() => setStaffNotified(!staffNotified)}
                      className={`relative h-5 w-9 rounded-full transition-colors ${
                        staffNotified ? "bg-green-500" : "bg-secondary"
                      }`}
                    >
                      <span
                        className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-card shadow transition-transform ${
                          staffNotified ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={isPending || !feedbackValid || !incidentValid}
              className="w-full min-h-[48px] bg-primary hover:bg-primary/90 text-white text-base"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  Completing…
                </>
              ) : (
                "Complete Session"
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
