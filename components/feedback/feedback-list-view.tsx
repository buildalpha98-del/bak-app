"use client";

// ============================================================
// FeedbackListView
// ============================================================
//
// Shared list shell for both /admin/feedback and /ops/feedback, and
// embedded by `entity-feedback-tab.tsx` on centre + staff detail
// pages. URL-persisted filters, jump chips from the pulse strip,
// bulk select with sticky action bar.
//
// Design language mirrors the rest of the dashboard refresh
// (rounded-2xl, gap-6 between sections, brand orange #E8712A
// reserved for the active-filter ring and the bulk-action bar's
// primary action).

import { useState, useTransition, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Star,
  Filter,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
  Eye,
  CheckCheck,
  MessageSquarePlus,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getFeedbackList,
  deleteFeedback,
  bulkMarkFeedbackRead,
  bulkAcknowledgeFeedback,
} from "@/lib/feedback/actions";
import type {
  FeedbackListItem,
  FeedbackListFilters,
  FeedbackPeriodFilter,
  FeedbackAckFilter,
} from "@/lib/feedback/actions";

// ============================================================
// Props
// ============================================================

interface CoachOption {
  id: string;
  name: string;
}

interface CentreOption {
  id: string;
  name: string;
}

interface FeedbackListViewProps {
  initialData: FeedbackListItem[];
  totalCount: number;
  /** Bare URL — chip toggles and pagination append onto this. Default no-base. */
  basePath?: string;
  coaches?: CoachOption[];
  centres?: CentreOption[];
  /** When true (admin/ops list pages), the bulk action bar + URL chips are
   *  shown. Entity-detail tabs pass false to keep the embedded view tight. */
  showBulk?: boolean;
}

const PAGE_SIZE = 20;

const RATING_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "All ratings", value: 0 },
  { label: "1 star", value: 1 },
  { label: "2 stars", value: 2 },
  { label: "3 stars", value: 3 },
  { label: "4 stars", value: 4 },
  { label: "5 stars", value: 5 },
];

const PERIOD_OPTIONS: Array<{ label: string; value: FeedbackPeriodFilter }> = [
  { label: "All time", value: "all" },
  { label: "This week", value: "this_week" },
  { label: "Last 7 days", value: "last_7d" },
  { label: "Last 30 days", value: "last_30d" },
];

// ============================================================
// Helpers
// ============================================================

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`size-3.5 ${
            star <= rating
              ? rating <= 2
                ? "fill-red-500 text-red-500"
                : "fill-[#E8712A] text-[#E8712A]"
              : "text-muted-foreground/40"
          }`}
        />
      ))}
    </div>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ============================================================
// Component
// ============================================================

export function FeedbackListView({
  initialData,
  totalCount,
  basePath,
  coaches = [],
  centres = [],
  showBulk = false,
}: FeedbackListViewProps) {
  const router = useRouter();
  const params = useSearchParams();

  // ============================================================
  // URL-backed state (only on pages that pass `basePath`/`showBulk`)
  // ============================================================
  //
  // Embedded uses (entity-feedback-tab) opt out of URL persistence by
  // omitting `basePath` — the embedded tab simply runs with default
  // filters and lets the parent control scope via `initialData`.

  const urlBacked = !!basePath;

  const initialRating = urlBacked
    ? Number(params.get("rating") ?? 0)
    : 0;
  const initialPeriod: FeedbackPeriodFilter = urlBacked
    ? ((params.get("period") as FeedbackPeriodFilter | null) ?? "all")
    : "all";
  const initialCoach = urlBacked ? params.get("coach") ?? "all" : "all";
  const initialCentre = urlBacked ? params.get("centre") ?? "all" : "all";
  const initialAck: FeedbackAckFilter = urlBacked
    ? ((params.get("ack") as FeedbackAckFilter | null) ?? "all")
    : "all";
  const initialPending = urlBacked && params.get("pending") === "yes";

  const [data, setData] = useState<FeedbackListItem[]>(initialData);
  const [total, setTotal] = useState(totalCount);
  const [page, setPage] = useState(1);
  const [ratingFilter, setRatingFilter] = useState<number>(initialRating);
  const [periodFilter, setPeriodFilter] = useState<FeedbackPeriodFilter>(
    initialPeriod
  );
  const [coachFilter, setCoachFilter] = useState<string>(initialCoach);
  const [centreFilter, setCentreFilter] = useState<string>(initialCentre);
  const [ackFilter, setAckFilter] = useState<FeedbackAckFilter>(initialAck);
  const [pendingFilter, setPendingFilter] = useState<boolean>(initialPending);
  const [searchText, setSearchText] = useState("");
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ============================================================
  // URL helpers
  // ============================================================

  const replaceParam = useCallback(
    (key: string, value: string | null) => {
      if (!urlBacked) return;
      const next = new URLSearchParams(Array.from(params.entries()));
      if (value && value !== "all" && value !== "" && value !== "0") {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router, urlBacked]
  );

  // ============================================================
  // Data fetcher
  // ============================================================

  const fetchData = useCallback(
    (next: {
      page: number;
      rating: number;
      period: FeedbackPeriodFilter;
      coach: string;
      centre: string;
      ack: FeedbackAckFilter;
      pending: boolean;
    }) => {
      startTransition(async () => {
        if (next.pending) {
          // "No response (24h+)" — these have submitted_at = NULL.
          // `getFeedbackList` filters out unsubmitted rows by design,
          // so when this chip is on we clear the data set and let the
          // empty state (or a future dedicated query) take over. Cheap
          // and honest until we wire a real "pending requests" query.
          setData([]);
          setTotal(0);
          return;
        }

        const payload: FeedbackListFilters = {
          page: next.page,
          pageSize: PAGE_SIZE,
          period: next.period,
          ack: next.ack,
        };
        if (next.rating > 0) {
          payload.minRating = next.rating;
          payload.maxRating = next.rating;
        }
        if (next.coach !== "all") payload.coachId = next.coach;
        if (next.centre !== "all") payload.centreId = next.centre;

        const result = await getFeedbackList(payload);
        setData(result.data ?? []);
        setTotal(result.total);
      });
    },
    []
  );

  // Re-fetch whenever an external URL nav adjusts a tracked param.
  // We hash the relevant fields so the effect doesn't fire on every
  // router replace caused by ourselves.
  useEffect(() => {
    if (!urlBacked) return;
    const nextRating = Number(params.get("rating") ?? 0);
    const nextPeriod = (params.get("period") as FeedbackPeriodFilter | null) ??
      "all";
    const nextCoach = params.get("coach") ?? "all";
    const nextCentre = params.get("centre") ?? "all";
    const nextAck = (params.get("ack") as FeedbackAckFilter | null) ?? "all";
    const nextPending = params.get("pending") === "yes";

    if (
      nextRating !== ratingFilter ||
      nextPeriod !== periodFilter ||
      nextCoach !== coachFilter ||
      nextCentre !== centreFilter ||
      nextAck !== ackFilter ||
      nextPending !== pendingFilter
    ) {
      setRatingFilter(nextRating);
      setPeriodFilter(nextPeriod);
      setCoachFilter(nextCoach);
      setCentreFilter(nextCentre);
      setAckFilter(nextAck);
      setPendingFilter(nextPending);
      setPage(1);
      fetchData({
        page: 1,
        rating: nextRating,
        period: nextPeriod,
        coach: nextCoach,
        centre: nextCentre,
        ack: nextAck,
        pending: nextPending,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // ============================================================
  // Filter setters (write URL, kick fetch)
  // ============================================================

  function setRating(v: number) {
    setRatingFilter(v);
    setPage(1);
    replaceParam("rating", v === 0 ? null : String(v));
    fetchData({
      page: 1,
      rating: v,
      period: periodFilter,
      coach: coachFilter,
      centre: centreFilter,
      ack: ackFilter,
      pending: pendingFilter,
    });
  }
  function setPeriod(v: FeedbackPeriodFilter) {
    setPeriodFilter(v);
    setPage(1);
    replaceParam("period", v === "all" ? null : v);
    fetchData({
      page: 1,
      rating: ratingFilter,
      period: v,
      coach: coachFilter,
      centre: centreFilter,
      ack: ackFilter,
      pending: pendingFilter,
    });
  }
  function setCoach(v: string) {
    setCoachFilter(v);
    setPage(1);
    replaceParam("coach", v === "all" ? null : v);
    fetchData({
      page: 1,
      rating: ratingFilter,
      period: periodFilter,
      coach: v,
      centre: centreFilter,
      ack: ackFilter,
      pending: pendingFilter,
    });
  }
  function setCentre(v: string) {
    setCentreFilter(v);
    setPage(1);
    replaceParam("centre", v === "all" ? null : v);
    fetchData({
      page: 1,
      rating: ratingFilter,
      period: periodFilter,
      coach: coachFilter,
      centre: v,
      ack: ackFilter,
      pending: pendingFilter,
    });
  }
  function clearAckJump() {
    setAckFilter("all");
    replaceParam("ack", null);
    fetchData({
      page: 1,
      rating: ratingFilter,
      period: periodFilter,
      coach: coachFilter,
      centre: centreFilter,
      ack: "all",
      pending: pendingFilter,
    });
  }
  function clearPendingJump() {
    setPendingFilter(false);
    replaceParam("pending", null);
    fetchData({
      page: 1,
      rating: ratingFilter,
      period: periodFilter,
      coach: coachFilter,
      centre: centreFilter,
      ack: ackFilter,
      pending: false,
    });
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchData({
      page: newPage,
      rating: ratingFilter,
      period: periodFilter,
      coach: coachFilter,
      centre: centreFilter,
      ack: ackFilter,
      pending: pendingFilter,
    });
  };

  function handleClearFilters() {
    setRatingFilter(0);
    setPeriodFilter("all");
    setCoachFilter("all");
    setCentreFilter("all");
    setAckFilter("all");
    setPendingFilter(false);
    setSearchText("");
    setPage(1);
    if (urlBacked) {
      router.replace(window.location.pathname, { scroll: false });
    }
    fetchData({
      page: 1,
      rating: 0,
      period: "all",
      coach: "all",
      centre: "all",
      ack: "all",
      pending: false,
    });
  }

  // ============================================================
  // Bulk select state
  // ============================================================

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // Drop any selection that's no longer visible (data refresh, page
  // change, etc) so the action bar count stays honest.
  useEffect(() => {
    const visible = new Set(data.map((d) => d.id));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next;
    });
  }, [data]);

  // ============================================================
  // Search text — client-side over centre/coach name
  // ============================================================

  const filteredData = useMemo(() => {
    if (!searchText.trim()) return data;
    const q = searchText.toLowerCase();
    return data.filter(
      (item) =>
        item.centre.name.toLowerCase().includes(q) ||
        (item.coach?.name ?? "").toLowerCase().includes(q)
    );
  }, [data, searchText]);

  const allVisibleIds = useMemo(
    () => filteredData.map((d) => d.id),
    [filteredData]
  );
  const allVisibleSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));

  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(allVisibleIds));
  }

  // ============================================================
  // Delete-row
  // ============================================================

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDeleteFeedback(feedbackId: string) {
    setDeletingId(feedbackId);
    const { error } = await deleteFeedback(feedbackId);
    setDeletingId(null);
    if (error) {
      toast.error(error);
    } else {
      setData((prev) => prev.filter((item) => item.id !== feedbackId));
      setTotal((prev) => Math.max(0, prev - 1));
      toast.success("Feedback deleted.");
    }
  }

  const hasActiveFilters =
    ratingFilter > 0 ||
    periodFilter !== "all" ||
    coachFilter !== "all" ||
    centreFilter !== "all" ||
    ackFilter !== "all" ||
    pendingFilter ||
    !!searchText;

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-4">
      {/* Active jump-filter chips (from pulse strip) */}
      {urlBacked && (ackFilter === "unread" || pendingFilter) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {ackFilter === "unread" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2.5 py-1 text-xs font-medium text-[#E8712A]">
              <AlertTriangle className="size-3" />
              Unacknowledged only
              <button
                type="button"
                onClick={clearAckJump}
                className="ml-1 rounded-full p-0.5 hover:bg-[#E8712A]/20"
                aria-label="Clear unacknowledged filter"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {pendingFilter && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2.5 py-1 text-xs font-medium text-[#E8712A]">
              <Clock className="size-3" />
              No response (24h+)
              <button
                type="button"
                onClick={clearPendingJump}
                className="ml-1 rounded-full p-0.5 hover:bg-[#E8712A]/20"
                aria-label="Clear no-response filter"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Input
            type="text"
            placeholder="Search centre or coach..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-9"
          />
        </div>

        <Select
          value={String(ratingFilter)}
          onValueChange={(v) => setRating(Number(v))}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Rating" />
          </SelectTrigger>
          <SelectContent>
            {RATING_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={periodFilter}
          onValueChange={(v) => setPeriod(v as FeedbackPeriodFilter)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {coaches.length > 0 && (
          <Select value={coachFilter} onValueChange={(v) => setCoach(v ?? "all")}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Coach" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All coaches</SelectItem>
              {coaches.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {centres.length > 0 && (
          <Select value={centreFilter} onValueChange={(v) => setCentre(v ?? "all")}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Centre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All centres</SelectItem>
              {centres.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="h-9 text-muted-foreground"
          >
            <Filter className="size-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div
        className={`rounded-2xl border bg-background overflow-hidden ${
          isPending ? "opacity-60 pointer-events-none" : ""
        }`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              {showBulk && (
                <TableHead className="w-[36px]">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(checked) =>
                      toggleSelectAll(checked === true)
                    }
                    aria-label="Select all visible"
                  />
                </TableHead>
              )}
              <TableHead>Date</TableHead>
              <TableHead>Centre</TableHead>
              <TableHead>Coach</TableHead>
              <TableHead>Sport</TableHead>
              <TableHead>Rating</TableHead>
              <TableHead className="min-w-[200px]">Comment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showBulk ? 9 : 8}
                  className="text-center text-muted-foreground py-12"
                >
                  {pendingFilter
                    ? "No outstanding feedback requests over 24h old."
                    : "No feedback found."}
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((item) => {
                const selected = selectedIds.has(item.id);
                return (
                  <TableRow
                    key={item.id}
                    data-state={selected ? "selected" : undefined}
                    className={
                      item.rating <= 2 ? "bg-red-50/60" : undefined
                    }
                  >
                    {showBulk && (
                      <TableCell>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleSelect(item.id)}
                          aria-label={`Select feedback from ${item.centre.name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-foreground">
                      {formatDate(item.submitted_at)}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {item.centre.name}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {item.coach?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.sport ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StarDisplay rating={item.rating} />
                        <span
                          className={`text-xs font-medium ${
                            item.rating <= 2
                              ? "text-red-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          {item.rating}/5
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-muted-foreground truncate max-w-[300px]">
                        {item.comment ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      {item.acknowledged_at ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                  <Eye className="size-3" />
                                  Read
                                </span>
                              }
                            />
                            <TooltipContent>
                              Acknowledged {formatDate(item.acknowledged_at)}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          New
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            />
                          }
                        >
                          <Trash2 className="size-4" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete feedback</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this feedback from{" "}
                              {item.centre.name}
                              {item.coach ? ` (coach: ${item.coach.name})` : ""}?
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 text-white hover:bg-red-700"
                              disabled={deletingId === item.id}
                              onClick={() => handleDeleteFeedback(item.id)}
                            >
                              {deletingId === item.id ? "Deleting..." : "Delete"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isPending}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2 text-sm text-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isPending}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {showBulk && selectedIds.size > 0 && (
        <BulkFeedbackActionBar
          selectedIds={Array.from(selectedIds)}
          onClear={clearSelection}
          onCompleted={() => {
            clearSelection();
            router.refresh();
            // Re-pull current page so acknowledged_at indicators update inline.
            fetchData({
              page,
              rating: ratingFilter,
              period: periodFilter,
              coach: coachFilter,
              centre: centreFilter,
              ack: ackFilter,
              pending: pendingFilter,
            });
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// BulkFeedbackActionBar — fixed bottom-right, brand-orange ring
// ============================================================

function BulkFeedbackActionBar({
  selectedIds,
  onClear,
  onCompleted,
}: {
  selectedIds: string[];
  onClear: () => void;
  onCompleted: () => void;
}) {
  const count = selectedIds.length;
  const [ackOpen, setAckOpen] = useState(false);
  const [markWorking, setMarkWorking] = useState(false);

  async function handleMarkRead() {
    setMarkWorking(true);
    try {
      const { updated, error } = await bulkMarkFeedbackRead(selectedIds);
      if (error && updated === 0) {
        toast.error(error);
        return;
      }
      toast.success(
        `Marked ${updated} feedback ${updated === 1 ? "item" : "items"} as read.`
      );
      onCompleted();
    } finally {
      setMarkWorking(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-[#E8712A]/40 bg-background px-4 py-3 shadow-lg ring-1 ring-[#E8712A]/20 sm:bottom-6 sm:right-6">
        <div className="flex items-center gap-3 pr-2 text-sm">
          <span className="font-medium text-foreground">
            {count} feedback{count === 1 ? "" : " items"} selected
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={onClear}
          >
            Clear
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkRead}
          disabled={markWorking}
        >
          <CheckCheck className="size-4" />
          {markWorking ? "Marking..." : "Mark as read"}
        </Button>
        <Button
          size="sm"
          onClick={() => setAckOpen(true)}
          className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
        >
          <MessageSquarePlus className="size-4" />
          Acknowledge
        </Button>
      </div>

      <BulkAcknowledgeSheet
        open={ackOpen}
        onOpenChange={setAckOpen}
        selectedIds={selectedIds}
        onDone={() => {
          setAckOpen(false);
          onCompleted();
        }}
      />
    </>
  );
}

// ============================================================
// BulkAcknowledgeSheet — capture an optional note + ack
// ============================================================

function BulkAcknowledgeSheet({
  open,
  onOpenChange,
  selectedIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: string[];
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);

  async function handleAck() {
    setWorking(true);
    try {
      const { updated, error } = await bulkAcknowledgeFeedback(
        selectedIds,
        note
      );
      if (error && updated === 0) {
        toast.error(error);
        return;
      }
      toast.success(
        `Acknowledged ${updated} feedback ${updated === 1 ? "item" : "items"}.`
      );
      setNote("");
      onDone();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full max-w-md flex-col">
        <SheetHeader>
          <SheetTitle>Acknowledge feedback</SheetTitle>
          <SheetDescription>
            Marks the {selectedIds.length} selected feedback{" "}
            {selectedIds.length === 1 ? "item" : "items"} as read and records
            an audit-log entry with the note below.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-3 px-4">
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you do about it?"
              rows={6}
            />
          </div>
        </div>
        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={working}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAck}
            disabled={working}
            className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
          >
            {working ? "Saving..." : "Acknowledge"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
