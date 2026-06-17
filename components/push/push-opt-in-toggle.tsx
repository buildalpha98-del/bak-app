"use client";

import { useEffect, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  subscribeToPush,
  unsubscribeFromPush,
  getPushPermissionState,
  type PushPermissionState,
} from "@/lib/push/client";
import { sendTestPush } from "@/lib/push/actions";

interface Props {
  /**
   * Initial subscription count rendered server-side. The toggle
   * updates this locally on subscribe/unsubscribe without re-fetching.
   */
  initialCount: number;
  /**
   * Localised heading -- coach profile vs admin staff detail want
   * slightly different framing.
   */
  heading?: string;
  /**
   * Short helper text shown beneath the toggle.
   */
  description?: string;
}

/**
 * Push opt-in card shared between coach/profile and the admin/ops
 * staff detail (own profile only). Mirrors the pattern in
 * `components/sms/sms-opt-in-toggle.tsx`: server-rendered initial
 * state, client-only side effects, optimistic UI on toggle.
 *
 * The permission state polls on focus so the user can flip the
 * browser-level permission in Settings and come back without
 * having to hard-refresh.
 */
export function PushOptInToggle({
  initialCount,
  heading = "Push Notifications",
  description = "Get urgent alerts -- shift swaps, waitlist offers, rerostering -- as a banner even when the tab is closed. You can revoke any time from your browser's site settings.",
}: Props) {
  const [count, setCount] = useState(initialCount);
  const [permission, setPermission] = useState<PushPermissionState>("default");
  const [busy, startTransition] = useTransition();
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setPermission(getPushPermissionState());
    const handler = () => setPermission(getPushPermissionState());
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, []);

  const enabled = permission === "granted" && count > 0;
  const unsupported = permission === "unsupported";
  const denied = permission === "denied";

  function handleToggle() {
    startTransition(async () => {
      if (enabled) {
        const { ok, error } = await unsubscribeFromPush();
        if (!ok) {
          toast.error(error ?? "Failed to unsubscribe.");
          return;
        }
        setCount((c) => Math.max(0, c - 1));
        toast.success("Push notifications disabled on this device.");
        return;
      }

      const { ok, error } = await subscribeToPush();
      if (!ok) {
        toast.error(error ?? "Failed to enable push notifications.");
        setPermission(getPushPermissionState());
        return;
      }
      setCount((c) => c + 1);
      setPermission(getPushPermissionState());
      toast.success("Push notifications enabled on this device.");
    });
  }

  async function handleTest() {
    setTesting(true);
    const { sent, failed, error } = await sendTestPush();
    setTesting(false);
    if (error) {
      toast.error(error);
      return;
    }
    if (sent === 0) {
      toast.error("No active subscriptions. Enable push first.");
      return;
    }
    toast.success(
      failed > 0
        ? `Test sent to ${sent} device(s); ${failed} failed.`
        : `Test sent to ${sent} device(s).`,
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {heading}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Badge variant={enabled ? "default" : "outline"} className="shrink-0">
          {enabled ? (
            <>
              <Bell className="mr-1 h-3 w-3" /> On
            </>
          ) : (
            <>
              <BellOff className="mr-1 h-3 w-3" /> Off
            </>
          )}
        </Badge>
      </div>

      {unsupported && (
        <p className="text-xs text-amber-600">
          Push notifications aren't supported in this browser. Install the app
          to your home screen or use a recent Chrome / Firefox / Safari build.
        </p>
      )}

      {denied && (
        <p className="text-xs text-amber-600">
          Notifications are blocked at the browser level. Open site settings
          and allow notifications, then click Enable again.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-xs text-muted-foreground">
          {count === 0
            ? "No devices subscribed"
            : count === 1
              ? "1 device subscribed"
              : `${count} devices subscribed`}
        </span>
        <div className="flex flex-wrap gap-2">
          {enabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send test
            </Button>
          )}
          <Button
            variant={enabled ? "outline" : "default"}
            size="sm"
            onClick={handleToggle}
            disabled={busy || unsupported || denied}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : enabled ? (
              <BellOff className="h-3.5 w-3.5" />
            ) : (
              <Bell className="h-3.5 w-3.5" />
            )}
            {enabled ? "Disable" : "Enable"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
