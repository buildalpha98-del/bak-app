"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bell, Play, Clock, Users, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toggleReminders, triggerReminders } from "@/lib/launch/reminder-actions";

export function ReminderSettings({
  initialEnabled,
  lastRun,
}: {
  initialEnabled: boolean;
  lastRun: Record<string, unknown> | null;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [toggling, setToggling] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [lastResult, setLastResult] = useState(lastRun);

  const handleToggle = async () => {
    setToggling(true);
    const result = await toggleReminders(!enabled);
    setToggling(false);
    if (result.success) {
      setEnabled(!enabled);
      toast.success(`Reminders ${!enabled ? "enabled" : "disabled"}`);
    } else {
      toast.error("Failed to update setting");
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    const result = await triggerReminders();
    setTriggering(false);
    if (result.success) {
      toast.success(
        `Sent ${result.data?.parentReminders ?? 0} parent and ${result.data?.coachReminders ?? 0} coach reminders`
      );
      setLastResult(result.data as Record<string, unknown> | null);
    } else {
      toast.error(result.error || "Failed to send reminders");
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Toggle Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Automated Session Reminders</CardTitle>
                <CardDescription>
                  Send email and in-app reminders 24 hours before sessions
                </CardDescription>
              </div>
            </div>
            <Button
              variant={enabled ? "default" : "outline"}
              onClick={handleToggle}
              disabled={toggling}
              className="min-w-[80px]"
            >
              {toggling ? "..." : enabled ? "On" : "Off"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>When enabled, the system automatically runs daily at 5:00 PM AEST and sends:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li><strong>Parent reminders</strong> — one email per child per session with time, location, and what to bring</li>
            <li><strong>Coach reminders</strong> — one email per coach with all their sessions for the next day</li>
          </ul>
          <p>Duplicate sends are prevented by the reminder log.</p>
        </CardContent>
      </Card>

      {/* Manual Trigger Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual Trigger</CardTitle>
          <CardDescription>
            Send reminders now for testing or ad-hoc purposes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleTrigger}
            disabled={triggering || !enabled}
            variant="outline"
          >
            <Play className="h-4 w-4 mr-2" />
            {triggering ? "Sending..." : "Send Reminders Now"}
          </Button>
          {!enabled && (
            <p className="text-xs text-muted-foreground mt-2">
              Enable reminders above to use the manual trigger.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Last Run Status */}
      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last Run</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {lastResult.date
                    ? `Sessions for ${lastResult.date as string}`
                    : "Recently"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {String(lastResult.parentReminders ?? 0)} parent reminders
                </span>
              </div>
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {String(lastResult.coachReminders ?? 0)} coach reminders
                </span>
              </div>
              {Number(lastResult.skipped ?? 0) > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {String(lastResult.skipped)} skipped (already sent)
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
