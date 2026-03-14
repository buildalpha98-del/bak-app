"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ArrowUpDown, UserX } from "lucide-react";
import { SessionStatusBadge } from "./session-status-badge";
import { formatDateShort, formatTime12 } from "@/lib/utils/roster";
import { SPORTS } from "@/lib/types/enums";
import type { SessionStatus } from "@/lib/types/enums";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import type { Centre, Profile } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

type SortColumn =
  | "date"
  | "time"
  | "centre"
  | "sport"
  | "coach"
  | "duration"
  | "status";
type SortDirection = "asc" | "desc";

interface SessionListViewProps {
  sessions: SessionWithRelations[];
  centres: Pick<Centre, "id" | "name">[];
  coaches: Pick<Profile, "id" | "name">[];
  onSessionClick: (session: SessionWithRelations) => void;
  onBulkPublish: (ids: string[]) => void;
  onBulkCancel: (ids: string[]) => void;
  onBulkReassign: (ids: string[], coachId: string) => void;
}

// ============================================================
// Status options for filter
// ============================================================

const STATUS_OPTIONS: { value: SessionStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "pending_confirmation", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// ============================================================
// Component
// ============================================================

export function SessionListView({
  sessions,
  centres,
  coaches,
  onSessionClick,
  onBulkPublish,
  onBulkCancel,
  onBulkReassign,
}: SessionListViewProps) {
  // Filters
  const [centreFilter, setCentreFilter] = useState("all");
  const [coachFilter, setCoachFilter] = useState("all");
  const [sportFilter, setSportFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<SessionStatus | "all">(
    "all"
  );
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  // Sort
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reassign coach select state
  const [reassignCoachId, setReassignCoachId] = useState<string>("");

  // Filter + sort
  const filteredSorted = useMemo(() => {
    let result = [...sessions];

    // Apply filters
    if (centreFilter !== "all") {
      result = result.filter((s) => s.centre_id === centreFilter);
    }
    if (coachFilter !== "all") {
      result = result.filter((s) => s.coach_id === coachFilter);
    }
    if (sportFilter !== "all") {
      result = result.filter((s) => s.sport === sportFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((s) => s.status === statusFilter);
    }
    if (unassignedOnly) {
      result = result.filter((s) => !s.coach_id);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "date":
          cmp = a.date.localeCompare(b.date);
          break;
        case "time":
          cmp = a.time.localeCompare(b.time);
          break;
        case "centre":
          cmp = a.centre_name.localeCompare(b.centre_name);
          break;
        case "sport":
          cmp = a.sport.localeCompare(b.sport);
          break;
        case "coach":
          cmp = (a.coach_name ?? "").localeCompare(b.coach_name ?? "");
          break;
        case "duration":
          cmp = a.duration_minutes - b.duration_minutes;
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return result;
  }, [
    sessions,
    centreFilter,
    coachFilter,
    sportFilter,
    statusFilter,
    unassignedOnly,
    sortColumn,
    sortDirection,
  ]);

  function toggleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredSorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSorted.map((s) => s.id)));
    }
  }

  const selectedArray = Array.from(selectedIds);

  function SortHeader({
    col,
    children,
  }: {
    col: SortColumn;
    children: React.ReactNode;
  }) {
    return (
      <TableHead>
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium"
          onClick={() => toggleSort(col)}
        >
          {children}
          <ArrowUpDown className="size-3 text-muted-foreground" />
        </button>
      </TableHead>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={centreFilter} onValueChange={(v) => setCentreFilter(v ?? "")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Centres" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Centres</SelectItem>
            {centres.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={coachFilter} onValueChange={(v) => setCoachFilter(v ?? "")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Coaches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Coaches</SelectItem>
            {coaches.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sportFilter} onValueChange={(v) => setSportFilter(v ?? "")}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Sports" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sports</SelectItem>
            {SPORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) =>
            setStatusFilter(v as SessionStatus | "all")
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={unassignedOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setUnassignedOnly((v) => !v)}
        >
          <UserX className="size-4" />
          Unassigned
        </Button>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onBulkPublish(selectedArray);
              setSelectedIds(new Set());
            }}
          >
            Publish
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onBulkCancel(selectedArray);
              setSelectedIds(new Set());
            }}
          >
            Cancel
          </Button>

          <div className="flex items-center gap-1">
            <Select
              value={reassignCoachId}
              onValueChange={(v) => setReassignCoachId(v ?? "")}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Select coach" />
              </SelectTrigger>
              <SelectContent>
                {coaches.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={!reassignCoachId}
              onClick={() => {
                if (reassignCoachId) {
                  onBulkReassign(selectedArray, reassignCoachId);
                  setSelectedIds(new Set());
                  setReassignCoachId("");
                }
              }}
            >
              Reassign
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={
                    filteredSorted.length > 0 &&
                    selectedIds.size === filteredSorted.length
                  }
                  onChange={toggleSelectAll}
                  className="size-4 rounded border-border"
                  aria-label="Select all sessions"
                />
              </TableHead>
              <SortHeader col="date">Date</SortHeader>
              <SortHeader col="time">Time</SortHeader>
              <SortHeader col="centre">Centre</SortHeader>
              <SortHeader col="sport">Sport</SortHeader>
              <SortHeader col="coach">Coach</SortHeader>
              <SortHeader col="duration">Duration</SortHeader>
              <SortHeader col="status">Status</SortHeader>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  No sessions found for this week.
                </TableCell>
              </TableRow>
            ) : (
              filteredSorted.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSessionClick(s)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleSelect(s.id)}
                      className="size-4 rounded border-border"
                      aria-label="Select session"
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDateShort(s.date)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatTime12(s.time.slice(0, 5))}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {s.centre_name}
                  </TableCell>
                  <TableCell className="text-sm">{s.sport}</TableCell>
                  <TableCell className="text-sm">
                    {s.coach_name ? (
                      s.coach_name
                    ) : (
                      <span className="italic text-amber-600">
                        Unassigned
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.duration_minutes}min
                  </TableCell>
                  <TableCell>
                    <SessionStatusBadge status={s.status} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" className="min-h-[44px] min-w-[44px]" aria-label="Session actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            onSelect={() => onSessionClick(s)}
                          >
                            View Details
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <p className="text-center text-xs text-muted-foreground">
        {filteredSorted.length} session
        {filteredSorted.length !== 1 ? "s" : ""} shown
        {filteredSorted.length !== sessions.length &&
          ` (${sessions.length} total)`}
      </p>
    </div>
  );
}
