"use client";

/**
 * /coach/profile → "Sync issues" card.
 *
 * Lists every queue item that has crossed the {@link MAX_ATTEMPTS} retry cap
 * and is now sentinelled as permanently-failed. Coaches can:
 *  - Tap "Retry" → resets the attempt counter and re-runs syncQueue.
 *  - Tap "Discard" → removes the row from IndexedDB.
 *
 * Hidden entirely when there are no stuck items, so the surface only shows
 * up when the coach actually has something to investigate.
 */

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RotateCcw, Trash2, AlertCircle, Loader2 } from "lucide-react";
import {
  dequeue,
  getQueue,
  MAX_ATTEMPTS,
  resetAttempts,
  type QueueItem,
  type QueueKind,
} from "@/lib/offline/db";
import { syncQueue } from "@/lib/offline/sync";

const KIND_LABEL: Record<QueueKind, string> = {
  attendance: "Attendance",
  form_submission: "Form submission",
  observation: "Session observation",
  status_broadcast: "Status broadcast",
  session_note: "Session note",
};

function relativeAge(epochMs: number): string {
  const diffMin = Math.max(0, Math.round((Date.now() - epochMs) / 60_000));
  if (diffMin === 0) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function SyncIssuesCard() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    const all = await getQueue();
    setItems(all.filter((it) => it.attempt >= MAX_ATTEMPTS));
    setLoaded(true);
  }

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(interval);
  }, []);

  function handleRetry(id: string) {
    startTransition(async () => {
      await resetAttempts(id);
      const result = await syncQueue();
      if (result.synced > 0) {
        toast.success("Retry succeeded");
      } else if (result.failed > 0) {
        toast.error("Retry failed — will surface here again");
      }
      await refresh();
    });
  }

  function handleDiscard(id: string) {
    startTransition(async () => {
      await dequeue(id);
      toast.success("Discarded");
      await refresh();
    });
  }

  if (!loaded || items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="size-4 text-red-600" />
        <h2 className="text-sm font-semibold text-red-700">
          Sync issues ({items.length})
        </h2>
      </div>
      <p className="text-xs text-muted-foreground">
        These submissions failed to sync after {MAX_ATTEMPTS} attempts. Retry
        once you have a stable connection, or discard if no longer needed.
      </p>
      <ul className="space-y-2">
        {items.map((it) => (
          <li
            key={it.id}
            className="rounded-xl border bg-card px-3 py-2.5 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  {KIND_LABEL[it.kind]}
                </p>
                <p className="text-xs text-muted-foreground">
                  Queued {relativeAge(it.createdAt)}
                </p>
                {it.lastError && (
                  <p className="mt-1 text-[11px] text-red-600 line-clamp-2">
                    {it.lastError}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => handleRetry(it.id)}
                  className="h-8 rounded-lg"
                >
                  {isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  <span className="ml-1 text-xs">Retry</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => handleDiscard(it.id)}
                  className="h-8 rounded-lg text-muted-foreground hover:text-red-600"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
