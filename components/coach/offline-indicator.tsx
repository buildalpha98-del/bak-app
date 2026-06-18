"use client";

/**
 * Coach offline indicator pill.
 *
 * States (rendered in priority order):
 *  1. Online + empty queue  → null (no chrome)
 *  2. Online + queue > 0    → orange "Syncing N items" pill, click to open popover
 *  3. Offline + empty queue → muted "Offline" pill
 *  4. Offline + queue > 0   → orange "Offline · N queued"
 *
 * Tapping a non-null pill opens a popover listing every queued item with a
 * kind icon, age (relative time), and per-item "Retry now" / "Discard"
 * affordances. The popover also exposes a footer "Sync all now" CTA so a
 * coach with a flaky connection can poke the engine on demand.
 */

import { useEffect, useState, useTransition } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  CloudOff,
  RefreshCw,
  Wifi,
  WifiOff,
  ClipboardCheck,
  FileText,
  Eye,
  Megaphone,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { updateAppBadge } from "@/lib/badge/badge";
import { useOnlineState } from "@/lib/offline/use-connection";
import {
  dequeue,
  getQueue,
  resetAttempts,
  MAX_ATTEMPTS,
  type QueueItem,
  type QueueKind,
} from "@/lib/offline/db";
import { syncQueue } from "@/lib/offline/sync";

const KIND_LABEL: Record<QueueKind, string> = {
  attendance: "Attendance",
  form_submission: "Form submission",
  observation: "Observation",
  status_broadcast: "Status broadcast",
  session_note: "Session note",
};

function KindIcon({ kind }: { kind: QueueKind }) {
  const className = "size-3.5 text-[#E8712A]";
  switch (kind) {
    case "attendance":
      return <ClipboardCheck className={className} />;
    case "form_submission":
      return <FileText className={className} />;
    case "observation":
      return <Eye className={className} />;
    case "status_broadcast":
      return <Megaphone className={className} />;
    case "session_note":
      return <Pencil className={className} />;
  }
}

function relativeAge(epochMs: number): string {
  const diffMin = Math.max(0, Math.round((Date.now() - epochMs) / 60_000));
  if (diffMin === 0) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function OfflineIndicator() {
  const { online, queueLength } = useOnlineState();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isPending, startTransition] = useTransition();

  // Surface the offline queue length on the home-screen icon. A coach
  // who's offline with 3 pending submissions sees a "3" on the BAK
  // app icon — the kind of cue that makes a PWA feel native.
  useEffect(() => {
    void updateAppBadge(queueLength);
  }, [queueLength]);

  // State 1: online + nothing queued → hide chrome.
  if (online && queueLength === 0) return null;

  async function refreshItems() {
    const list = await getQueue();
    setItems(list);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) void refreshItems();
  }

  function handleSyncAll() {
    startTransition(async () => {
      const result = await syncQueue();
      if (result.synced > 0) {
        toast.success(
          `Synced ${result.synced} submission${result.synced === 1 ? "" : "s"}`,
        );
      }
      if (result.failed > 0) {
        toast.error(
          `${result.failed} item${result.failed === 1 ? "" : "s"} failed — will retry`,
        );
      }
      await refreshItems();
    });
  }

  function handleRetryOne(id: string) {
    startTransition(async () => {
      await resetAttempts(id);
      const result = await syncQueue();
      if (result.synced > 0) toast.success("Retried");
      await refreshItems();
    });
  }

  function handleDiscardOne(id: string) {
    startTransition(async () => {
      await dequeue(id);
      toast.success("Discarded");
      await refreshItems();
    });
  }

  // Decide pill appearance.
  let pillClass = "border-border bg-muted/40 text-muted-foreground";
  let pillIcon = <WifiOff className="size-3.5" />;
  let pillText = "Offline";
  let pulsing = false;

  if (online && queueLength > 0) {
    pillClass = "border-[#E8712A]/40 bg-[#E8712A]/10 text-[#E8712A]";
    pillIcon = <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} />;
    pillText = `Syncing ${queueLength} item${queueLength === 1 ? "" : "s"}`;
    pulsing = true;
  } else if (!online && queueLength > 0) {
    pillClass = "border-[#E8712A]/40 bg-[#E8712A]/10 text-[#E8712A]";
    pillIcon = <CloudOff className="size-3.5" />;
    pillText = `Offline · ${queueLength} queued`;
    pulsing = true;
  } else if (!online && queueLength === 0) {
    pillClass = "border-border bg-muted/40 text-muted-foreground";
    pillIcon = <WifiOff className="size-3.5" />;
    pillText = "Offline";
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={pillText}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px]",
              pillClass,
              pulsing && "animate-pulse",
            )}
          >
            {pillIcon}
            <span>{pillText}</span>
          </button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(92vw,360px)] rounded-2xl p-0"
      >
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Sync queue
              </p>
              <p className="text-xs text-muted-foreground">
                {online
                  ? "Submissions waiting to send"
                  : "Will sync when you reconnect"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {online ? (
                <Wifi className="size-3.5 text-emerald-600" />
              ) : (
                <WifiOff className="size-3.5 text-muted-foreground" />
              )}
            </div>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              {queueLength === 0 ? "Queue is empty." : "Loading…"}
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((it) => {
                const permanentlyFailed = it.attempt >= MAX_ATTEMPTS;
                return (
                  <li key={it.id} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">
                        <KindIcon kind={it.kind} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {KIND_LABEL[it.kind]}
                          </p>
                          {permanentlyFailed ? (
                            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                              Failed
                            </span>
                          ) : it.attempt > 0 ? (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              Retry {it.attempt}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {relativeAge(it.createdAt)}
                        </p>
                        {it.lastError && (
                          <p className="mt-1 truncate text-[11px] text-red-600">
                            {it.lastError}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          aria-label="Retry now"
                          disabled={isPending}
                          onClick={() => handleRetryOne(it.id)}
                          className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <RotateCcw className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Discard"
                          disabled={isPending}
                          onClick={() => handleDiscardOne(it.id)}
                          className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t bg-muted/30 px-4 py-3">
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={isPending || !online}
              onClick={handleSyncAll}
              className="w-full rounded-xl bg-[#E8712A] text-white hover:bg-[#d05f1f]"
            >
              {isPending ? (
                <>
                  <RefreshCw className="mr-2 size-3.5 animate-spin" />
                  Syncing…
                </>
              ) : (
                "Sync all now"
              )}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
