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

  // Click notification
  async function handleNotificationClick(notification: Notification) {
    if (!notification.read) {
      await markNotificationRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    const url = getNotificationUrl(
      notification.entity_type,
      notification.entity_id,
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
            notifications.map((notification) => {
              const Icon = ICON_MAP[notification.type] ?? Bell;
              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className="flex w-full gap-3 border-b border-border/50 last:border-b-0 px-4 py-3 hover:bg-secondary/50 transition-colors duration-200 text-left"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-orange-light)]">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {notification.title}
                      </p>
                      {!notification.read && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse-warm" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {notification.body}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {timeAgo(notification.created_at)}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

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
      </PopoverContent>
    </Popover>
  );
}
