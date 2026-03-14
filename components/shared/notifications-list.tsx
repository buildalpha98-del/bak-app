"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarCheck,
  ArrowRightLeft,
  AlertTriangle,
  ClipboardList,
  Package,
  FileText,
  MessageSquare,
  CheckCircle2,
  ShieldAlert,
  Star,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications/actions";
import { useNotificationsRealtime } from "@/lib/hooks/useNotificationsRealtime";
import { getNotificationUrl } from "@/lib/notifications/url-builder";
import type { Notification } from "@/lib/types/database";
import type { LucideIcon } from "lucide-react";

// ============================================================
// Icon mapping (shared with notification-bell)
// ============================================================

const ICON_MAP: Record<string, LucideIcon> = {
  shift_assigned: CalendarCheck,
  shift_confirmed: CalendarCheck,
  shift_declined: CalendarCheck,
  shift_cancelled: CalendarCheck,
  shift_reminder: CalendarCheck,
  bulk_shifts_confirmed: CalendarCheck,
  swap_request_created: ArrowRightLeft,
  swap_request_accepted: ArrowRightLeft,
  swap_request_declined: ArrowRightLeft,
  swap_approved: ArrowRightLeft,
  swap_rejected: ArrowRightLeft,
  incident_reported: AlertTriangle,
  session_duration_review: AlertTriangle,
  form_reminder: ClipboardList,
  compliance_expiry_30d: ShieldAlert,
  compliance_expiry_7d: ShieldAlert,
  announcement_posted: MessageSquare,
  task_assigned: CheckCircle2,
  document_added: FileText,
  equipment_changed: Package,
  invoice_status_changed: FileText,
  feedback_received: Star,
};

const TIER_LABELS: Record<string, string> = {
  all: "All",
  urgent: "Urgent",
  important: "Important",
  informational: "Info",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ============================================================
// Component
// ============================================================

interface NotificationsListProps {
  initialNotifications: Notification[];
  userId: string;
  userRole?: string;
}

export function NotificationsList({
  initialNotifications,
  userId,
  userRole = "coach",
}: NotificationsListProps) {
  const router = useRouter();
  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);
  const [filter, setFilter] = useState<"all" | "urgent" | "important" | "informational">("all");

  // Realtime — prepend new notifications
  const handleNewNotification = useCallback((notification: Notification) => {
    setNotifications((prev) => [notification, ...prev]);
  }, []);

  useNotificationsRealtime(userId, handleNewNotification);

  // Filter
  const filtered =
    filter === "all"
      ? notifications
      : notifications.filter((n) => n.tier === filter);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Click handler
  async function handleClick(notification: Notification) {
    if (!notification.read) {
      await markNotificationRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
    }

    const url = getNotificationUrl(
      notification.entity_type,
      notification.entity_id,
      userRole
    );
    router.push(url);
  }

  // Mark all read
  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Notifications</h1>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            className="text-xs"
          >
            Mark all read ({unreadCount})
          </Button>
        )}
      </div>

      {/* Tier filter */}
      <div className="flex gap-2">
        {(["all", "urgent", "important", "informational"] as const).map(
          (tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => setFilter(tier)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === tier
                  ? "bg-primary text-white"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {TIER_LABELS[tier]}
            </button>
          )
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">
              {filter === "all"
                ? "No notifications yet"
                : `No ${filter} notifications`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((notification) => {
            const Icon = ICON_MAP[notification.type] ?? Bell;
            return (
              <Card
                key={notification.id}
                className={`card-hover cursor-pointer transition-colors hover:bg-secondary ${
                  !notification.read ? "border-l-2 border-l-primary" : ""
                }`}
              >
                <CardContent className="py-3">
                  <button
                    type="button"
                    onClick={() => handleClick(notification)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-orange-light)]">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground/60">
                          {timeAgo(notification.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.body}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            notification.tier === "urgent"
                              ? "bg-red-100 text-red-700"
                              : notification.tier === "important"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {notification.tier}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60">
                          {formatDate(notification.created_at)}
                        </span>
                      </div>
                    </div>
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
