"use client";

import { useState, useEffect } from "react";
import { Bell, Check, X } from "lucide-react";
import {
  getAnnouncementReadReceipts,
  nudgeUnreadUsers,
  type ReadReceiptEntry,
} from "@/lib/announcements/read-receipt-actions";

// ============================================================
// AnnouncementReadReceipts — standalone card component
// ============================================================

interface AnnouncementReadReceiptsProps {
  announcementId: string;
}

export function AnnouncementReadReceipts({
  announcementId,
}: AnnouncementReadReceiptsProps) {
  const [entries, setEntries] = useState<ReadReceiptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [nudging, setNudging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getAnnouncementReadReceipts(announcementId);
      if (result.error) {
        setError(result.error);
      } else {
        setEntries(result.data ?? []);
      }
      setLoading(false);
    }
    load();
  }, [announcementId]);

  const readCount = entries.filter((e) => e.hasRead).length;
  const totalCount = entries.length;
  const unreadUsers = entries.filter((e) => !e.hasRead);
  const percentage = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

  async function handleNudge() {
    if (unreadUsers.length === 0) return;
    setNudging(true);
    const result = await nudgeUnreadUsers(
      announcementId,
      unreadUsers.map((u) => u.userId)
    );
    if (result.error) {
      setError(result.error);
    }
    setNudging(false);
  }

  function formatReadDate(dateStr: string | null): string {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatRole(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="h-3 w-48 rounded bg-muted" />
          <div className="h-2 w-full rounded bg-muted" />
          <div className="space-y-2 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-full rounded bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border p-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Read Receipts
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {readCount} of {totalCount} staff have read this
          </p>
        </div>
        {unreadUsers.length > 0 && (
          <button
            type="button"
            onClick={handleNudge}
            disabled={nudging}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Bell className="h-3.5 w-3.5" />
            {nudging ? "Sending..." : `Nudge ${unreadUsers.length}`}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">
            {percentage}% read
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Staff list */}
      <div className="max-h-64 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">No staff in audience</p>
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.userId}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0"
            >
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  entry.hasRead
                    ? "bg-green-100 text-green-600"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {entry.hasRead ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {entry.name}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {formatRole(entry.role)}
                </span>
                {entry.hasRead && entry.readAt && (
                  <span className="text-xs text-muted-foreground/60">
                    {formatReadDate(entry.readAt)}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
