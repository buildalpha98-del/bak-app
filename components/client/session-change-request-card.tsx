"use client";

// Portal self-service (migration 086): request a reschedule or
// cancellation for an upcoming session. Self-contained — loads the
// session's request history and swaps the form for a status card once
// a request is pending.

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  submitSessionChangeRequest,
  getSessionChangeRequests,
  type SessionChangeRequest,
} from "@/lib/client/change-request-actions";

interface SessionChangeRequestCardProps {
  centreId: string;
  sessionId: string;
}

export function SessionChangeRequestCard({
  centreId,
  sessionId,
}: SessionChangeRequestCardProps) {
  const [requests, setRequests] = useState<SessionChangeRequest[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [requestType, setRequestType] = useState<"reschedule" | "cancel">(
    "reschedule"
  );
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedTime, setRequestedTime] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getSessionChangeRequests(centreId, sessionId).then(({ data }) => {
      if (!cancelled) setRequests(data);
    });
    return () => {
      cancelled = true;
    };
  }, [centreId, sessionId]);

  const pending = requests?.find((r) => r.status === "pending");
  const latestResolved = requests?.find((r) => r.status !== "pending");

  function handleSubmit() {
    startTransition(async () => {
      const { error } = await submitSessionChangeRequest(centreId, sessionId, {
        requestType,
        requestedDate: requestedDate || undefined,
        requestedTime: requestedTime || undefined,
        reason,
      });
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Request sent — our team will confirm shortly.");
      setFormOpen(false);
      setReason("");
      const { data } = await getSessionChangeRequests(centreId, sessionId);
      setRequests(data);
    });
  }

  if (requests === null) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-portal-600" />
          Need a change?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">
              {pending.request_type === "cancel"
                ? "Cancellation requested"
                : `Reschedule requested${pending.requested_date ? ` for ${pending.requested_date}` : ""}`}
            </p>
            <p className="mt-0.5 text-xs">
              Our team has been notified and will confirm shortly.
            </p>
          </div>
        ) : formOpen ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              {(["reschedule", "cancel"] as const).map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={requestType === t ? "default" : "outline"}
                  className={
                    requestType === t
                      ? "rounded-2xl bg-portal-600 text-white hover:bg-portal-600/90"
                      : "rounded-2xl"
                  }
                  onClick={() => setRequestType(t)}
                >
                  {t === "reschedule" ? "Reschedule" : "Cancel session"}
                </Button>
              ))}
            </div>
            {requestType === "reschedule" && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={requestedDate}
                  onChange={(e) => setRequestedDate(e.target.value)}
                  aria-label="Preferred new date"
                />
                <Input
                  type="time"
                  value={requestedTime}
                  onChange={(e) => setRequestedTime(e.target.value)}
                  aria-label="Preferred time (optional)"
                />
              </div>
            )}
            <Textarea
              placeholder={
                requestType === "cancel"
                  ? "Why does this session need to be cancelled?"
                  : "Anything we should know? (excursion, assembly, wet weather...)"
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="rounded-2xl bg-portal-600 text-white hover:bg-portal-600/90"
                disabled={isPending}
                onClick={handleSubmit}
              >
                {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Send request
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFormOpen(false)}
              >
                Never mind
              </Button>
            </div>
          </div>
        ) : (
          <>
            {latestResolved && (
              <div
                className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
                  latestResolved.status === "approved"
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-border bg-muted/40 text-muted-foreground"
                }`}
              >
                {latestResolved.status === "approved" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div>
                  <p className="font-medium">
                    Your{" "}
                    {latestResolved.request_type === "cancel"
                      ? "cancellation"
                      : "reschedule"}{" "}
                    request was {latestResolved.status}
                  </p>
                  {latestResolved.resolution_note && (
                    <p className="mt-0.5 text-xs">
                      {latestResolved.resolution_note}
                    </p>
                  )}
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Ask us to reschedule or cancel this session — no phone call
              needed.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="rounded-2xl"
              onClick={() => setFormOpen(true)}
            >
              Request a change
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
