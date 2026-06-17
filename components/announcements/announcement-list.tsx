"use client";

// ============================================================
// Announcement list
// ============================================================
//
// Final-batch refresh:
//   - URL-persisted filter chips (?audience=&period=&read=)
//   - bulk-select on cards + sticky BulkActionBar with bulk-delete
//     (admins/ops only)
//   - rounded-2xl shells, restrained orange CTAs
//
// The single-item delete dialog + AnnouncementDetail behaviour are
// preserved so the coach/ops sidebars + parent flows keep working.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Megaphone, Plus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AnnouncementCard } from "@/components/announcements/announcement-card";
import { AnnouncementDetail } from "@/components/announcements/announcement-detail";
import { CreateAnnouncementForm } from "@/components/announcements/create-announcement-form";
import {
  getAnnouncements,
  deleteAnnouncement,
  bulkDeleteAnnouncements,
} from "@/lib/announcements/actions";
import type { EnrichedAnnouncement } from "@/lib/announcements/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { UserRole } from "@/lib/types/enums";

interface AnnouncementListProps {
  initialAnnouncements: EnrichedAnnouncement[];
  canCreate: boolean;
  role: UserRole;
}

const AUDIENCE_VALUES = ["all", "coaches_only", "ops_and_coaches"] as const;

export function AnnouncementList({
  initialAnnouncements,
  canCreate,
  role,
}: AnnouncementListProps) {
  const router = useRouter();
  const params = useSearchParams();

  const audienceFilter = params.get("audience");
  const periodFilter = params.get("period"); // this_week | this_month
  const readFilter = params.get("read"); // low | mine_unread

  function clearParam(key: string) {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.delete(key);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  function setParam(key: string, value: string | null) {
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (value === null || value === "") sp.delete(key);
    else sp.set(key, value);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const [announcements, setAnnouncements] =
    useState<EnrichedAnnouncement[]>(initialAnnouncements);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialAnnouncements.length >= 20);
  const [loading, setLoading] = useState(false);
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<
    string | null
  >(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  // Sync to initial when SSR data changes (filter chip navigations
  // re-fetch via Next routing → fresh initialAnnouncements arrives).
  useEffect(() => {
    setAnnouncements(initialAnnouncements);
    setPage(1);
    setHasMore(initialAnnouncements.length >= 20);
    setSelectedIds(new Set());
  }, [initialAnnouncements]);

  // ============================================================
  // Filtered list (client-side; the server fetch returns all
  // recent announcements and we narrow here so filter chip toggles
  // feel instant).
  // ============================================================
  const filtered = useMemo(() => {
    let list = announcements;
    if (audienceFilter && (AUDIENCE_VALUES as readonly string[]).includes(audienceFilter)) {
      list = list.filter((a) => a.audience === audienceFilter);
    }
    if (periodFilter === "this_week") {
      const monday = new Date();
      monday.setDate(monday.getDate() - monday.getDay() || -6);
      monday.setHours(0, 0, 0, 0);
      const mondayIso = monday.toISOString();
      list = list.filter((a) => a.created_at >= mondayIso);
    } else if (periodFilter === "this_month") {
      const first = new Date();
      first.setDate(1);
      first.setHours(0, 0, 0, 0);
      const firstIso = first.toISOString();
      list = list.filter((a) => a.created_at >= firstIso);
    }
    if (readFilter === "low") {
      list = list.filter((a) => {
        if (a.audience_count === 0) return false;
        return a.read_count / a.audience_count < 0.3;
      });
    } else if (readFilter === "mine_unread") {
      list = list.filter((a) => !a.is_read);
    }
    return list;
  }, [announcements, audienceFilter, periodFilter, readFilter]);

  async function handleDelete(announcementId: string) {
    setDeletingId(announcementId);
    const { error } = await deleteAnnouncement(announcementId);
    setDeletingId(null);
    if (error) {
      toast.error(error);
    } else {
      setAnnouncements((prev) => prev.filter((a) => a.id !== announcementId));
      toast.success("Announcement deleted.");
    }
  }

  async function loadMore() {
    setLoading(true);
    const nextPage = page + 1;
    const { data } = await getAnnouncements(nextPage);
    if (data && data.length > 0) {
      setAnnouncements((prev) => [...prev, ...data]);
      setPage(nextPage);
      setHasMore(data.length >= 20);
    } else {
      setHasMore(false);
    }
    setLoading(false);
  }

  // ============================================================
  // Bulk actions
  // ============================================================
  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (!checked) return setSelectedIds(new Set());
    setSelectedIds(new Set(filtered.map((a) => a.id)));
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { data, error } = await bulkDeleteAnnouncements(ids);
      if (error) {
        toast.error(error);
        return;
      }
      const succeeded = data?.succeeded ?? 0;
      const failed = data?.failed.length ?? 0;
      if (failed > 0) {
        toast.warning(
          `Deleted ${succeeded}, failed ${failed}.`
        );
      } else {
        toast.success(
          `Deleted ${succeeded} announcement${succeeded === 1 ? "" : "s"}.`
        );
      }
      setAnnouncements((prev) =>
        prev.filter((a) => !selectedIds.has(a.id))
      );
      setSelectedIds(new Set());
      setBulkConfirmOpen(false);
    } finally {
      setBulkDeleting(false);
    }
  }

  const allSelected =
    filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Announcements
        </h1>
        {canCreate && (
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Announcement
          </Button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FilterChip
          active={!audienceFilter}
          onClick={() => clearParam("audience")}
          label="All audiences"
        />
        <FilterChip
          active={audienceFilter === "coaches_only"}
          onClick={() => setParam("audience", "coaches_only")}
          label="Coaches only"
        />
        <FilterChip
          active={audienceFilter === "ops_and_coaches"}
          onClick={() => setParam("audience", "ops_and_coaches")}
          label="Ops + coaches"
        />

        <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" />

        <FilterChip
          active={periodFilter === "this_week"}
          onClick={() =>
            setParam("period", periodFilter === "this_week" ? null : "this_week")
          }
          label="This week"
        />
        <FilterChip
          active={periodFilter === "this_month"}
          onClick={() =>
            setParam(
              "period",
              periodFilter === "this_month" ? null : "this_month"
            )
          }
          label="This month"
        />

        <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" />

        <FilterChip
          active={readFilter === "low"}
          onClick={() =>
            setParam("read", readFilter === "low" ? null : "low")
          }
          label="Low-read"
          tone="red"
        />
        <FilterChip
          active={readFilter === "mine_unread"}
          onClick={() =>
            setParam(
              "read",
              readFilter === "mine_unread" ? null : "mine_unread"
            )
          }
          label="Unread by me"
        />
      </div>

      {/* Create dialog */}
      {canCreate && (
        <CreateAnnouncementForm
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}

      {/* Select-all row (admin only) */}
      {canCreate && filtered.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) => toggleAll(c === true)}
            aria-label="Select all visible"
          />
          Select all visible
        </label>
      )}

      {/* Announcement cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((announcement) => {
            const selected = selectedIds.has(announcement.id);
            return (
              <div
                key={announcement.id}
                className="relative group"
                data-selected={selected || undefined}
              >
                {canCreate && (
                  <div className="absolute top-3 left-3 z-10">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleId(announcement.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${announcement.title}`}
                    />
                  </div>
                )}
                <div className={canCreate ? "pl-10" : ""}>
                  <AnnouncementCard
                    announcement={announcement}
                    role={role}
                    onClick={() => setSelectedAnnouncementId(announcement.id)}
                  />
                </div>
                {canCreate && (
                  <div className="absolute top-3 right-12 opacity-0 group-hover:opacity-100 transition-opacity">
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete &quot;{announcement.title}&quot;? This
                            will also remove all read receipts. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 text-white hover:bg-red-700"
                            disabled={deletingId === announcement.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(announcement.id);
                            }}
                          >
                            {deletingId === announcement.id ? "Deleting…" : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Megaphone className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-base font-heading font-semibold text-foreground mb-1">
            {announcements.length === 0
              ? "No announcements yet"
              : "No announcements match the filters"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {announcements.length === 0
              ? "Announcements from the Build Alpha Kids team will appear here."
              : "Try clearing a filter chip above to widen the view."}
          </p>
        </div>
      )}

      {/* Load more */}
      {hasMore && filtered.length > 0 && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loading}
          >
            {loading && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Load More
          </Button>
        </div>
      )}

      {/* Detail sheet */}
      <AnnouncementDetail
        announcementId={selectedAnnouncementId}
        role={role}
        onClose={() => setSelectedAnnouncementId(null)}
      />

      {/* Sticky bulk-action bar */}
      {canCreate && selectedIds.size > 0 && (
        <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-[#E8712A]/40 bg-background px-4 py-3 shadow-lg ring-1 ring-[#E8712A]/20 sm:bottom-6 sm:right-6">
          <div className="flex items-center gap-3 pr-2 text-sm">
            <span className="font-medium text-foreground">
              {selectedIds.size} announcement{selectedIds.size === 1 ? "" : "s"}{" "}
              selected
            </span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
          <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
            <AlertDialogTrigger
              render={
                <Button
                  size="sm"
                  className="bg-red-600 text-white hover:bg-red-700"
                />
              }
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedIds.size} announcement{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will also remove all read receipts. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={bulkDeleting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 text-white hover:bg-red-700"
                  disabled={bulkDeleting}
                  onClick={(e) => {
                    e.preventDefault();
                    handleBulkDelete();
                  }}
                >
                  {bulkDeleting ? "Deleting…" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  tone = "orange",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "orange" | "red";
}) {
  const activeClasses =
    tone === "red"
      ? "border-red-600/40 bg-red-600/10 text-red-600"
      : "border-[#E8712A]/40 bg-[#E8712A]/10 text-[#E8712A]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${activeClasses}`
          : "inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      }
    >
      {label}
      {active && (
        <X
          aria-hidden
          className="h-3 w-3 opacity-70"
        />
      )}
    </button>
  );
}
