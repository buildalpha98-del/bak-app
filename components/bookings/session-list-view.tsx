"use client";

// ============================================================
// SessionListView
// ============================================================
//
// Used at /admin/bookings/sessions and /ops/bookings/sessions.
// Mirrors the centres / staff list refresh:
//   - URL-persisted search + filters (status, sport, type)
//   - rounded-2xl shell on filter bar + table
//   - bulk-select with sticky BulkActionBar (Publish / Activate)
//   - restrained orange — chips & primary bulk action only

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Calendar,
  MapPin,
  Users,
  CircleCheck,
  Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BookableSession } from "@/lib/types/database";
import type {
  BookableSessionType,
  BookableSessionStatus,
} from "@/lib/types/enums";
import { SPORTS } from "@/lib/types/enums";
import {
  bulkActivateSessions,
  bulkPublishSessions,
} from "@/lib/bookings/admin-booking-actions";

interface SessionListViewProps {
  initialData: BookableSession[];
  basePath: string;
}

const SESSION_TYPE_LABELS: Record<BookableSessionType, string> = {
  holiday_clinic: "Holiday Clinic",
  after_school: "After School",
  weekend: "Weekend",
  specialist: "Specialist",
  other: "Other",
};

const STATUS_BADGE_VARIANT: Record<
  BookableSessionStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  open: "default",
  draft: "secondary",
  closed: "outline",
  cancelled: "destructive",
  completed: "secondary",
};

const STATUS_LABELS: Record<BookableSessionStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
  completed: "Completed",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatSessionType(type: BookableSessionType): string {
  return (
    SESSION_TYPE_LABELS[type] ??
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function capacityColour(current: number, max: number): string {
  const ratio = current / max;
  if (ratio >= 1) return "text-red-600";
  if (ratio >= 0.75) return "text-amber-600";
  return "text-green-600";
}

export function SessionListView({ initialData, basePath }: SessionListViewProps) {
  const router = useRouter();
  const params = useSearchParams();

  // ============================================================
  // URL-backed state
  // ============================================================
  const [search, setSearchState] = useState(params.get("search") ?? "");
  const typeFilter = (params.get("type") ?? "all") as
    | BookableSessionType
    | "all";
  const statusFilter = (params.get("status") ?? "all") as
    | BookableSessionStatus
    | "all";
  const sportFilter = params.get("sport") ?? "all";

  const replaceParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(Array.from(params.entries()));
      if (value && value !== "all" && value !== "") next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router]
  );

  function setSearch(v: string) {
    setSearchState(v);
    replaceParam("search", v || null);
  }

  // ============================================================
  // Bulk selection
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

  // ============================================================
  // Derived list
  // ============================================================
  const filtered = useMemo(() => {
    return initialData.filter((session) => {
      if (typeFilter !== "all" && session.session_type !== typeFilter)
        return false;
      if (statusFilter !== "all" && session.status !== statusFilter)
        return false;
      if (sportFilter !== "all" && session.sport !== sportFilter) return false;

      if (search) {
        const q = search.toLowerCase();
        const matchesTitle = session.title.toLowerCase().includes(q);
        const matchesLocation = session.location_name?.toLowerCase().includes(q);
        const matchesSuburb = session.suburb.toLowerCase().includes(q);
        if (!matchesTitle && !matchesLocation && !matchesSuburb) return false;
      }

      return true;
    });
  }, [initialData, search, typeFilter, statusFilter, sportFilter]);

  const allVisibleIds = useMemo(() => filtered.map((s) => s.id), [filtered]);
  const allVisibleSelected =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedIds.has(id));

  function toggleSelectAll(checked: boolean) {
    if (!checked) return setSelectedIds(new Set());
    setSelectedIds(new Set(allVisibleIds));
  }

  useEffect(() => {
    // Drop selection when the URL filters change so the bar's count
    // doesn't lie about what's selected vs visible.
    setSelectedIds(new Set());
  }, [typeFilter, statusFilter, sportFilter, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Bookable Sessions
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} session{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button render={<Link href={`${basePath}/new`} />}>
          <Plus className="size-4" />
          Create Session
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, location, suburb..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={typeFilter}
          onValueChange={(v) =>
            replaceParam(
              "type",
              v === "all" ? null : (v as BookableSessionType)
            )
          }
        >
          <SelectTrigger className="w-[160px]">
            <Calendar className="size-4 text-muted-foreground" />
            <SelectValue placeholder="Session Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="holiday_clinic">Holiday Clinic</SelectItem>
            <SelectItem value="after_school">After School</SelectItem>
            <SelectItem value="weekend">Weekend</SelectItem>
            <SelectItem value="specialist">Specialist</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) =>
            replaceParam(
              "status",
              v === "all" ? null : (v as BookableSessionStatus)
            )
          }
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sportFilter}
          onValueChange={(v) => replaceParam("sport", v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sport" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sports</SelectItem>
            {SPORTS.map((sport) => (
              <SelectItem key={sport} value={sport}>
                {sport}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <Calendar className="size-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No sessions found
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your filters or create a new session.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-background overflow-hidden hover:shadow-md transition">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36px]">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(c) => toggleSelectAll(c === true)}
                    aria-label="Select all visible"
                  />
                </TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((session) => {
                const selected = selectedIds.has(session.id);
                return (
                  <TableRow
                    key={session.id}
                    data-state={selected ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleSelect(session.id)}
                        aria-label={`Select ${session.title}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`${basePath}/${session.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {session.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatSessionType(session.session_type)}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(session.date)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatTime(session.start_time)} –{" "}
                      {formatTime(session.end_time)}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3.5 text-muted-foreground" />
                        {session.suburb}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`flex items-center gap-1 font-medium ${capacityColour(session.current_bookings, session.max_capacity)}`}
                      >
                        <Users className="size-3.5" />
                        {session.current_bookings} / {session.max_capacity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[session.status]}>
                        {STATUS_LABELS[session.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatPrice(session.price_cents)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Sticky bulk-action bar */}
      {selectedIds.size > 0 && (
        <SessionsListBulkBar
          selectedIds={Array.from(selectedIds)}
          onClear={clearSelection}
          onDone={() => {
            clearSelection();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Sticky bulk bar
// ============================================================

function SessionsListBulkBar({
  selectedIds,
  onClear,
  onDone,
}: {
  selectedIds: string[];
  onClear: () => void;
  onDone: () => void;
}) {
  const count = selectedIds.length;
  const [working, setWorking] = useState<"activate" | "publish" | null>(null);

  async function handleActivate() {
    setWorking("activate");
    try {
      const { updated, error } = await bulkActivateSessions(selectedIds);
      if (error && updated === 0) {
        toast.error(error);
        return;
      }
      toast.success(
        `Activated ${updated} session${updated === 1 ? "" : "s"}.`
      );
      onDone();
    } finally {
      setWorking(null);
    }
  }

  async function handlePublish() {
    setWorking("publish");
    try {
      const { updated, error } = await bulkPublishSessions(selectedIds);
      if (error && updated === 0) {
        toast.error(error);
        return;
      }
      toast.success(
        `Published ${updated} session${updated === 1 ? "" : "s"}.`
      );
      onDone();
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-background px-4 py-3 shadow-lg ring-1 ring-primary/20 sm:bottom-6 sm:right-6">
      <div className="flex items-center gap-3 pr-2 text-sm">
        <span className="font-medium text-foreground">
          {count} session{count === 1 ? "" : "s"} selected
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
        onClick={handlePublish}
        disabled={working !== null}
      >
        <Megaphone className="size-4" />
        {working === "publish" ? "Publishing…" : "Publish"}
      </Button>
      <Button
        size="sm"
        onClick={handleActivate}
        disabled={working !== null}
        className="bg-primary text-white hover:bg-primary/90"
      >
        <CircleCheck className="size-4" />
        {working === "activate" ? "Activating…" : "Activate"}
      </Button>
    </div>
  );
}
