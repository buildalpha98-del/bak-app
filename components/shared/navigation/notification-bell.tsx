"use client";

import { useState, useEffect, useCallback } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getRecentNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications/actions";
import { useNotificationsRealtime } from "@/lib/hooks/useNotificationsRealtime";
import { getNotificationUrl } from "@/lib/notifications/url-builder";
import type { Notification } from "@/lib/types/database";
import type { LucideIcon } from "lucide-react";

// ============================================================
// Icon mapping
// ============================================================

const ICON_MAP: Record<string, LucideIcon> = {
  // Staff/Coach types
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
  // Launch notification types (parent, centre, general)
  booking_confirmed: CalendarCheck,
  payment_received: CheckCircle2,
  session_completed: ClipboardList,
  session_reminder: CalendarCheck,
  roster_assigned: CalendarCheck,
  roster_changed: ArrowRightLeft,
  child_update: Star,
  invoice_ready: FileText,
  general: Bell,
  waitlist_offer: Star,
  roster_published: CalendarCheck,
};

// ============================================================
// Time formatting
// ============================================================

// ============================================================
// Notification grouping
// ============================================================

interface GroupedNotification {
  key: string;
  notifications: Notification[];
  type: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
}

function groupNotifications(
  notifications: Notification[]
): GroupedNotification[] {
  const ONE_HOUR = 60 * 60 * 1000;
  const groups: GroupedNotification[] = [];

  for (const notification of notifications) {
    const lastGroup = groups[groups.length - 1];

    // Check if this notification can be merged into the previous group:
    // same type and within 1 hour of the group's most recent notification
    if (
      lastGroup &&
      lastGroup.type === notification.type &&
      Math.abs(
        new Date(lastGroup.notifications[lastGroup.notifications.length - 1].created_at).getTime() -
          new Date(notification.created_at).getTime()
      ) <= ONE_HOUR
    ) {
      lastGroup.notifications.push(notification);
      // Update group display fields
      const count = lastGroup.notifications.length;
      lastGroup.title = `${count} ${notification.title}`;
      lastGroup.body = `${count} similar notifications`;
      // read only if ALL in the group are read
      lastGroup.read = lastGroup.notifications.every((n) => n.read);
    } else {
      groups.push({
        key: notification.id,
        notifications: [notification],
        type: notification.type,
        title: notification.title,
        body: notification.body,
        created_at: notification.created_at,
        read: notification.read,
      });
    }
  }

  return groups;
}

// ============================================================
// Time formatting
// ============================================================

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

// ============================================================
// Component
// ============================================================

interface NotificationBellProps {
  userId: string;
  userRole?: string;
}

export function NotificationBell({
  userId,
  userRole = "coach",
}: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch initial data
  useEffect(() => {
    async function load() {
      const [notifResult, countResult] = await Promise.all([
        getRecentNotifications(10),
        getUnreadCount(),
      ]);
      if (notifResult.data) setNotifications(notifResult.data);
      setUnreadCount(countResult.data);
    }
    load();
  }, []);

  // Realtime subscription
  const handleNewNotification = useCallback((notification: Notification) => {
    setNotifications((prev) => [notification, ...prev].slice(0, 20));
    setUnreadCount((prev) => prev + 1);
  }, []);

  useNotificationsRealtime(userId, handleNewNotification);

  // Click grouped notification — marks ALL contained notifications as read
  async function handleGroupedClick(group: GroupedNotification) {
    const unreadInGroup = group.notifications.filter((n) => !n.read);
    if (unreadInGroup.length > 0) {
      await Promise.all(
        unreadInGroup.map((n) => markNotificationRead(n.id))
      );
      const unreadIds = new Set(unreadInGroup.map((n) => n.id));
      setNotifications((prev) =>
        prev.map((n) => (unreadIds.has(n.id) ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - unreadInGroup.length));
    }

    // Navigate: prefer action_url (from launch system), fall back to entity-based URL
    const first = group.notifications[0];
    const actionUrl = (first as unknown as Record<string, unknown>).action_url as string | null;
    const url = actionUrl || getNotificationUrl(
      first.entity_type,
      first.entity_id,
      userRole
    );
    setOpen(false);
    router.push(url);
  }

  // Mark all as read
  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white animate-scale-in">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 overflow-hidden" sideOffset={8}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-secondary/30">
          <h3 className="text-sm font-semibold text-foreground">
            Notifications
          </h3>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors duration-200"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            groupNotifications(notifications).map((group) => {
              const Icon = ICON_MAP[group.type] ?? Bell;
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => handleGroupedClick(group)}
                  className="flex w-full gap-3 border-b border-border/50 last:border-b-0 px-4 py-3 hover:bg-secondary/50 transition-colors duration-200 text-left"
                >
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-orange-light)]">
                    <Icon className="h-4 w-4 text-primary" />
                    {group.notifications.length > 1 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-white">
                        {group.notifications.length}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {group.title}
                      </p>
                      {!group.read && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse-warm" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {group.body}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {timeAgo(group.created_at)}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Portal (client) users have no notifications page — their
            /{role}/notifications route doesn't exist, so the link would
            silently bounce to the dashboard. */}
        {userRole !== "client" && (
          <div className="border-t border-border px-4 py-2.5 text-center bg-secondary/20">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(`/${userRole}/notifications`);
              }}
              className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors duration-200"
            >
              View all notifications
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
