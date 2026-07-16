"use client";

// ============================================================
// Unified inbox — timeline view
// ============================================================
//
// A single triage surface for admin/ops. Each `InboxItem` renders
// with a tier-coloured left border (urgent = red-500, important =
// brand orange, informational = muted), an icon, headline, entity
// chip, due-at, and 1-2 quick action buttons.
//
// Quick actions hit `acknowledgeInboxItem` directly via a
// `useTransition` — sonner toast on error, `router.refresh()` on
// success so the list rebuilds from the source-of-truth queries.

import * as React from "react";
import Link from "@/components/ui/app-link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Calendar,
  CheckCheck,
  Filter,
  Inbox,
  MessageSquare,
  Repeat,
  Star,
  UserMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCountUp } from "@/components/launch/use-count-up";
import { acknowledgeInboxItem } from "@/lib/inbox/actions";
import type { InboxItem, InboxSource, InboxTier } from "@/lib/inbox/types";
import { cn } from "@/lib/utils";

interface InboxViewProps {
  items: InboxItem[];
  basePath: string;
}

const SOURCE_LABEL: Record<InboxSource | "all", string> = {
  all: "All sources",
  task: "Tasks",
  notification: "Notifications",
  flagged_feedback: "Flagged feedback",
  needs_replacement_shift: "Cover needed",
  unread_message: "Messages",
  churn_alert: "Churn risk",
  unconfirmed_shift: "Unconfirmed shifts",
  swap_request: "Swap requests",
};

const TIER_LABEL: Record<InboxTier | "all", string> = {
  all: "All tiers",
  urgent: "Urgent",
  important: "Important",
  informational: "Informational",
};

const SOURCE_ICON: Record<InboxSource, React.ComponentType<{ className?: string }>> = {
  task: CheckCheck,
  notification: Bell,
  flagged_feedback: Star,
  needs_replacement_shift: AlertTriangle,
  unread_message: MessageSquare,
  churn_alert: AlertCircle,
  unconfirmed_shift: Calendar,
  swap_request: Repeat,
};

export function InboxView({ items, basePath }: InboxViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sourceParam = (searchParams.get("source") ?? "all") as InboxSource | "all";
  const tierParam = (searchParams.get("tier") ?? "all") as InboxTier | "all";

  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      if (sourceParam !== "all" && item.source !== sourceParam) return false;
      if (tierParam !== "all" && item.tier !== tierParam) return false;
      return true;
    });
  }, [items, sourceParam, tierParam]);

  const ticked = useCountUp(filteredItems.length);

  const updateParam = React.useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === "all") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      router.replace(`${basePath}?${next.toString()}`, { scroll: false });
    },
    [router, searchParams, basePath],
  );

  return (
    <div className="space-y-5">
      {/* Greeting strip */}
      <div className="rounded-2xl border bg-background px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
              <Inbox className="size-4" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold leading-tight">
                Inbox
              </h2>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold tabular-nums text-foreground">
                  {ticked}
                </span>{" "}
                {filteredItems.length === 1 ? "item" : "items"} needing
                triage
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="size-3.5 text-muted-foreground" />
            <Select
              value={sourceParam}
              onValueChange={(v) => updateParam("source", v ?? "all")}
            >
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(SOURCE_LABEL) as Array<InboxSource | "all">
                ).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SOURCE_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={tierParam}
              onValueChange={(v) => updateParam("tier", v ?? "all")}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TIER_LABEL) as Array<InboxTier | "all">).map(
                  (key) => (
                    <SelectItem key={key} value={key}>
                      {TIER_LABEL[key]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Timeline */}
      {filteredItems.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2.5">
          {filteredItems.map((item) => (
            <InboxRow key={`${item.source}-${item.id}`} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-10 text-center">
      <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-background">
        <Inbox className="size-5 text-muted-foreground" />
      </div>
      <p className="font-display text-sm font-semibold text-foreground">
        Inbox zero — nicely done.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Action-needing items will show up here as they arrive.
      </p>
    </div>
  );
}

function InboxRow({ item }: { item: InboxItem }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const Icon = SOURCE_ICON[item.source];

  const borderClass =
    item.tier === "urgent"
      ? "border-l-[4px] border-l-red-500"
      : item.tier === "important"
        ? "border-l-[3px] border-l-primary"
        : "border-l-2 border-l-muted-foreground/40";

  const iconColour =
    item.tier === "urgent"
      ? "text-red-500"
      : item.tier === "important"
        ? "text-primary"
        : "text-muted-foreground";

  const onAction = (actionKey: string) => {
    if (actionKey === "open") {
      router.push(item.href);
      return;
    }
    startTransition(async () => {
      const result = await acknowledgeInboxItem(
        item.source,
        item.id,
        actionKey,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.redirectTo) {
        router.push(result.redirectTo);
        return;
      }
      toast.success("Done.");
      router.refresh();
    });
  };

  const dueLabel = formatDue(item.dueAt);

  return (
    <li
      className={cn(
        "group rounded-2xl border bg-background px-4 py-3 transition hover:bg-muted/30",
        borderClass,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full bg-muted/50",
              iconColour,
            )}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={item.href}
                className="font-semibold text-sm text-foreground hover:underline"
              >
                {item.title}
              </Link>
              <TierChip tier={item.tier} />
              <SourceChip label={item.sourceLabel} />
              {item.entity.label && <EntityChip label={item.entity.label} />}
              {dueLabel && <DueChip label={dueLabel} tier={item.tier} />}
            </div>
            {item.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {item.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {item.actions.map((action) => (
            <Button
              key={action.key}
              size="xs"
              variant={
                action.variant === "destructive"
                  ? "destructive"
                  : action.key === "open"
                    ? "ghost"
                    : "outline"
              }
              onClick={() => onAction(action.key)}
              disabled={pending}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </li>
  );
}

function TierChip({ tier }: { tier: InboxTier }) {
  const style =
    tier === "urgent"
      ? "bg-red-500/10 text-red-600"
      : tier === "important"
        ? "bg-primary/10 text-primary"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        style,
      )}
    >
      {tier}
    </span>
  );
}

function SourceChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function EntityChip({ label }: { label: string }) {
  return (
    <span className="inline-flex max-w-[200px] truncate rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function DueChip({ label, tier }: { label: string; tier: InboxTier }) {
  const Icon = tier === "urgent" ? AlertCircle : Calendar;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        tier === "urgent"
          ? "bg-red-500/10 text-red-600"
          : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}

/** Compact due/expiry label — "today", "in 2d", "overdue 3d", etc. */
function formatDue(due: string | null): string | null {
  if (!due) return null;
  // Parse YYYY-MM-DD or ISO timestamps the same way.
  const dueDate = new Date(due.length === 10 ? `${due}T00:00:00` : due);
  if (Number.isNaN(dueDate.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "due today";
  if (diffDays === 1) return "due tomorrow";
  if (diffDays > 0) return `in ${diffDays}d`;
  return `overdue ${Math.abs(diffDays)}d`;
}

// Suppress unused-import warning when the chip is rendered without
// a UserMinus path — kept for entity icon expansion (lead/coach).
void UserMinus;
