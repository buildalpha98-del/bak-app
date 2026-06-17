"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { setProfileSmsOptIn, setParentSmsOptIn } from "@/lib/sms/actions";

interface Props {
  /**
   * Which row to update: `profile` flips `profiles.sms_opt_in`
   * (used on /coach/profile), `parent` flips `parent_profiles.sms_opt_in`
   * (used on /parent/account). The component picks the right server
   * action so the page doesn't have to know which table the toggle lives on.
   */
  scope: "profile" | "parent";
  initialValue: boolean;
  /** Localised label — different surfaces phrase the opt-in differently. */
  label?: string;
  /** Short helper text shown beneath the toggle. */
  description?: string;
}

/**
 * SMS opt-in toggle shared between coach and parent settings.
 *
 * SMS fallback only fires when this flag is true and the platform has a
 * configured provider — see `sendUrgentNotificationViaSms` in
 * `lib/sms/actions.ts`. We optimistically flip the local state, then
 * revert on server-action failure.
 */
export function SmsOptInToggle({
  scope,
  initialValue,
  label,
  description,
}: Props) {
  const [checked, setChecked] = useState(initialValue);
  const [, startTransition] = useTransition();

  const handleChange = (next: boolean) => {
    setChecked(next);
    startTransition(async () => {
      const action = scope === "profile" ? setProfileSmsOptIn : setParentSmsOptIn;
      const { error } = await action(next);
      if (error) {
        toast.error(error);
        setChecked(!next);
        return;
      }
      toast.success(
        next ? "SMS alerts enabled." : "SMS alerts disabled.",
      );
    });
  };

  const heading =
    scope === "profile" ? "Urgent SMS Alerts" : "Booking SMS Reminders";
  const resolvedLabel =
    label ??
    (scope === "profile"
      ? "Receive urgent SMS alerts"
      : "Receive SMS reminders for bookings");
  const resolvedDescription =
    description ??
    (scope === "profile"
      ? "If you go offline during an urgent push notification, we'll text you instead. Standard SMS rates may apply."
      : "Get booking confirmations and reminders by SMS in addition to email. Standard SMS rates may apply.");

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {heading}
      </h2>
      <p className="text-xs text-muted-foreground">{resolvedDescription}</p>
      <div className="flex items-center gap-3">
        <Label htmlFor="sms-opt-in-toggle" className="text-sm text-foreground">
          {resolvedLabel}
        </Label>
        <Input
          id="sms-opt-in-toggle"
          type="checkbox"
          checked={checked}
          onChange={(e) => handleChange(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-xs text-muted-foreground">
          {checked ? "On" : "Off"}
        </span>
      </div>
    </Card>
  );
}
