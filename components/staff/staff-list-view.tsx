"use client";

// ============================================================
// StaffListView
// ============================================================
//
// Shared list shell for /admin/staff and /ops/staff. Drives:
//   - URL-persisted filter chip row (search, role, status, region,
//     compliance) + view-mode toggle
//   - jump-link chips from the pulse strip (?compliance=expired etc.)
//   - utilisation column with 4-week tooltip, next/last-shift column,
//     region badge, financial-access badge
//   - grid + table view modes; table mode adds bulk-select with a
//     sticky bottom-right action bar (reset passwords / archive /
//     announce / export)
//
// Design language mirrors the /admin home + /admin/centres + /admin/roster
// refreshes: rounded-2xl containers, restrained brand orange, gap-6
// between sections, gap-4 within.

import { useState, useMemo, useCallback, useEffect, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Plus,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Users,
  LayoutGrid,
  List,
  X,
  Banknote,
  FileDown,
  MessageSquarePlus,
  KeyRound,
  UserX,
  UserCheck,
  MapPin,
  CalendarClock,
  Archive,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  bulkArchiveStaff,
  bulkResetPasswords,
  bulkSendStaffAnnouncement,
  exportStaffCsv,
  reactivateStaffMember,
} from "@/lib/staff/actions";
import type { StaffListItem } from "@/lib/staff/actions";
import type { UserRole, UserStatus } from "@/lib/types/enums";

// ============================================================
// Helpers
// ============================================================

const STATUS_STYLES: Record<UserStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-700" },
  inactive: { label: "Inactive", className: "bg-secondary text-muted-foreground" },
  onboarding: { label: "Onboarding", className: "bg-amber-100 text-amber-700" },
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  ops: "Ops",
  coach: "Coach",
  parent: "Parent",
};

type ComplianceFilter = "all" | "verified" | "pending" | "expired";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Utilisation thresholds — picked to mirror the constraint solver
 * weighting and what Abdul calls "under-rostered / over-rostered"
 * in scheduling reviews. Coaches default Mon–Fri 8:00–16:30 →
 * 42.5 hrs raw availability, but live target is ~30 hrs/wk.
 */
function utilisationTone(hours: number): {
  bar: string;
  text: string;
  label?: string;
} {
  if (hours < 10) {
    return {
      bar: "bg-muted-foreground/50",
      text: "text-muted-foreground",
      label: "Under-rostered",
    };
  }
  if (hours <= 25) {
    return { bar: "bg-[#E8712A]", text: "text-foreground" };
  }
  if (hours <= 35) {
    return { bar: "bg-emerald-500", text: "text-foreground" };
  }
  return {
    bar: "bg-amber-500",
    text: "text-amber-700",
    label: "Over-rostered",
  };
}

function formatShiftLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day}, ${time}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================
// Component
// ============================================================

interface RegionOption {
  id: string;
  name: string;
}

interface StaffListViewProps {
  initialData: StaffListItem[];
  basePath?: string;
  regions?: RegionOption[];
  /** Whether the viewer has financial-access (toggles the CSV column + invoice chip). */
  hasFinancialAccess?: boolean;
  /** Viewer's role — admin gets the Reset passwords + Archive bulk actions. */
  viewerRole?: UserRole;
}

export function StaffListView({
  initialData,
  basePath = "/admin/staff",
  regions = [],
  hasFinancialAccess = false,
  viewerRole = "admin",
}: StaffListViewProps) {
  const router = useRouter();
  const params = useSearchParams();

  // ============================================================
  // URL-backed state
  // ============================================================
  //
  // All filters are mirrored to the query string so a filtered view is
  // shareable + refresh-safe. Default values are NOT serialised so the
  // bare URL stays clean. The pulse strip jump-links flip `compliance=`
  // / `utilisation=` / `status=onboarding`, which surface as removable
  // orange-tinted chips above the filter bar.

  const [section, setSectionState] = useState<"active" | "archive">(
    params.get("section") === "archive" ? "archive" : "active"
  );
  const [search, setSearchState] = useState(params.get("search") ?? "");
  const [roleFilter, setRoleFilterState] = useState<UserRole | "all">(
    (params.get("role") as UserRole | null) ?? "all"
  );
  const [statusFilter, setStatusFilterState] = useState<UserStatus | "all">(
    (params.get("status") as UserStatus | null) ?? "all"
  );
  const [regionFilter, setRegionFilterState] = useState<string>(
    params.get("region") ?? "all"
  );
  const [complianceFilter, setComplianceFilterState] =
    useState<ComplianceFilter>(
      (params.get("compliance") as ComplianceFilter | null) ?? "all"
    );
  const [viewMode, setViewModeState] = useState<"grid" | "table">(
    params.get("view") === "grid" ? "grid" : "table"
  );

  // Jump-link from pulse "K not rostered this week" — narrows to
  // hours_this_week === 0 active coaches.
  const utilisationZero = params.get("utilisation") === "zero";

  const replaceParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(Array.from(params.entries()));
      if (value && value !== "all" && value !== "") {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router]
  );

  function setSection(v: "active" | "archive") {
    setSectionState(v);
    replaceParam("section", v === "active" ? null : v);
    setSelectedIds(new Set());
  }
  function setSearch(v: string) {
    setSearchState(v);
    replaceParam("search", v || null);
  }
  function setRoleFilter(v: UserRole | "all") {
    setRoleFilterState(v);
    replaceParam("role", v === "all" ? null : v);
  }
  function setStatusFilter(v: UserStatus | "all") {
    setStatusFilterState(v);
    replaceParam("status", v === "all" ? null : v);
  }
  function setRegionFilter(v: string) {
    setRegionFilterState(v);
    replaceParam("region", v === "all" ? null : v);
  }
  function setComplianceFilter(v: ComplianceFilter) {
    setComplianceFilterState(v);
    replaceParam("compliance", v === "all" ? null : v);
  }
  function setViewMode(v: "grid" | "table") {
    setViewModeState(v);
    replaceParam("view", v === "table" ? null : v);
  }
  function clearJumpFilter(key: "compliance" | "utilisation") {
    if (key === "compliance") {
      setComplianceFilter("all");
    } else {
      replaceParam("utilisation", null);
    }
  }

  function clearAllFilters() {
    setSearchState("");
    setRoleFilterState("all");
    setStatusFilterState("all");
    setRegionFilterState("all");
    setComplianceFilterState("all");
    router.replace("?", { scroll: false });
  }

  // ============================================================
  // Selection state (table view only)
  // ============================================================

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (viewMode !== "table" && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [viewMode, selectedIds.size]);

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
    let items = initialData.filter((i) =>
      section === "archive" ? i.status === "inactive" : i.status !== "inactive"
    );
    if (roleFilter !== "all") {
      items = items.filter((i) => i.role === roleFilter);
    }
    if (statusFilter !== "all") {
      items = items.filter((i) => i.status === statusFilter);
    }
    if (regionFilter !== "all") {
      items = items.filter((i) => i.region_id === regionFilter);
    }
    if (complianceFilter === "expired") {
      items = items.filter((i) => i.compliance_summary.expired > 0);
    } else if (complianceFilter === "pending") {
      items = items.filter((i) => i.compliance_summary.pending > 0);
    } else if (complianceFilter === "verified") {
      items = items.filter(
        (i) =>
          i.compliance_summary.total > 0 &&
          i.compliance_summary.expired === 0 &&
          i.compliance_summary.pending === 0
      );
    }
    if (utilisationZero) {
      items = items.filter(
        (i) =>
          i.role === "coach" &&
          i.status === "active" &&
          i.hours_this_week === 0
      );
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.email.toLowerCase().includes(q)
      );
    }
    return items;
  }, [
    initialData,
    section,
    roleFilter,
    statusFilter,
    regionFilter,
    complianceFilter,
    utilisationZero,
    search,
  ]);

  const allVisibleIds = useMemo(() => filtered.map((i) => i.id), [filtered]);
  const allVisibleSelected =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedIds.has(id));
  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(allVisibleIds));
  }

  const regionsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of regions) map.set(r.id, r.name);
    return map;
  }, [regions]);

  const activeCount = useMemo(
    () => initialData.filter((i) => i.status !== "inactive").length,
    [initialData]
  );
  const archiveCount = useMemo(
    () => initialData.filter((i) => i.status === "inactive").length,
    [initialData]
  );

  const anyFilterActive =
    search !== "" ||
    roleFilter !== "all" ||
    statusFilter !== "all" ||
    regionFilter !== "all" ||
    complianceFilter !== "all" ||
    utilisationZero;

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Staff</h1>
          <p className="text-sm text-muted-foreground">
            {section === "archive"
              ? `${archiveCount} archived team member${archiveCount === 1 ? "" : "s"}`
              : `${activeCount} team member${activeCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button
          render={<Link href={`${basePath}/new`} />}
          className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
        >
          <Plus className="size-4" />
          Add Staff
        </Button>
      </div>

      {/* Active / Archive tabs */}
      <Tabs
        value={section}
        onValueChange={(v) => setSection(v as "active" | "archive")}
      >
        <TabsList variant="line">
          <TabsTrigger value="active">Active Staff</TabsTrigger>
          <TabsTrigger value="archive">
            <Archive className="size-3.5" />
            Archive
            {archiveCount > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {archiveCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Active jump-filter chips (from pulse strip) */}
      {(complianceFilter !== "all" || utilisationZero) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {complianceFilter !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2.5 py-1 text-xs font-medium text-[#E8712A]">
              <AlertTriangle className="size-3" />
              {complianceFilter === "expired"
                ? "Expired certs"
                : complianceFilter === "pending"
                  ? "Pending verifications"
                  : "All verified"}
              <button
                type="button"
                onClick={() => clearJumpFilter("compliance")}
                className="ml-1 rounded-full p-0.5 hover:bg-[#E8712A]/20"
                aria-label="Clear compliance filter"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {utilisationZero && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2.5 py-1 text-xs font-medium text-[#E8712A]">
              <CalendarClock className="size-3" />
              Not rostered this week
              <button
                type="button"
                onClick={() => clearJumpFilter("utilisation")}
                className="ml-1 rounded-full p-0.5 hover:bg-[#E8712A]/20"
                aria-label="Clear utilisation filter"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Filters chip row */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={roleFilter}
          onValueChange={(v) => setRoleFilter(v as UserRole | "all")}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="ops">Ops</SelectItem>
            <SelectItem value="coach">Coach</SelectItem>
          </SelectContent>
        </Select>

        {section === "active" && (
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as UserStatus | "all")}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="onboarding">Onboarding</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Select
          value={regionFilter}
          onValueChange={(v) => setRegionFilter((v as string | null) ?? "all")}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Regions</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={complianceFilter}
          onValueChange={(v) => setComplianceFilter(v as ComplianceFilter)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Compliance" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Compliance</SelectItem>
            <SelectItem value="verified">All verified</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>

        {anyFilterActive && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            <X className="size-4" />
            Clear all
          </Button>
        )}

        <div className="ml-auto flex rounded-lg border">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
            className={
              viewMode === "grid"
                ? "bg-[#E8712A]/10 text-[#E8712A] hover:bg-[#E8712A]/15"
                : ""
            }
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("table")}
            aria-label="Table view"
            className={
              viewMode === "table"
                ? "bg-[#E8712A]/10 text-[#E8712A] hover:bg-[#E8712A]/15"
                : ""
            }
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          {section === "archive" ? (
            <Archive className="mb-3 size-10 text-muted-foreground/50" />
          ) : (
            <Users className="mb-3 size-10 text-muted-foreground/50" />
          )}
          <p className="text-sm font-medium text-foreground">
            {section === "archive" ? "Archive is empty" : "No staff found"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {section === "archive"
              ? "Deleted staff show up here — their details are kept for 7 years per Fair Work requirements."
              : anyFilterActive
                ? "Try adjusting your filters."
                : "Add your first team member to get started."}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <StaffGridView
          items={filtered}
          basePath={basePath}
          regionsById={regionsById}
          section={section}
          onRestored={() => router.refresh()}
        />
      ) : (
        <div className="rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36px]">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(checked) =>
                      toggleSelectAll(checked === true)
                    }
                    aria-label="Select all visible"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden lg:table-cell">Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Compliance</TableHead>
                <TableHead className="hidden md:table-cell">
                  Utilisation
                </TableHead>
                <TableHead className="hidden md:table-cell">Shift</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((member) => {
                const statusStyle = STATUS_STYLES[member.status];
                const cs = member.compliance_summary;
                const regionName = member.region_id
                  ? regionsById.get(member.region_id) ?? null
                  : null;
                const selected = selectedIds.has(member.id);
                return (
                  <TableRow
                    key={member.id}
                    data-state={selected ? "selected" : undefined}
                    className="hover:bg-muted/30"
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleSelect(member.id)}
                        aria-label={`Select ${member.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          {member.photo_url && (
                            <AvatarImage
                              src={member.photo_url}
                              alt={member.name}
                            />
                          )}
                          <AvatarFallback className="bg-[#E8712A] text-[10px] font-semibold text-white">
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {member.name}
                          </span>
                          {regionName && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="size-3" />
                              {regionName}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {member.email}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          {ROLE_LABELS[member.role]}
                        </Badge>
                        {member.financial_access && (
                          <Badge
                            variant="secondary"
                            className="hidden gap-1 border-[#E8712A]/40 bg-[#E8712A]/10 text-[#E8712A] lg:inline-flex"
                          >
                            <Banknote className="size-3" />
                            Finance
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.credentials_purged_at ? (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Permanently deleted
                        </span>
                      ) : (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}
                        >
                          {statusStyle.label}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ComplianceIndicator
                        summary={cs}
                        memberId={member.id}
                        basePath={basePath}
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <UtilisationCell member={member} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <ShiftCell member={member} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {section === "archive" && !member.credentials_purged_at && (
                          <RestoreButton
                            id={member.id}
                            onRestored={() => router.refresh()}
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          render={<Link href={`${basePath}/${member.id}`} />}
                        >
                          View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Sticky bulk-action bar (table view only) */}
      {viewMode === "table" && selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          onClear={clearSelection}
          viewerRole={viewerRole}
          hasFinancialAccess={hasFinancialAccess}
          section={section}
          onCompleted={() => {
            clearSelection();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Compliance indicator — link-to-detail with the tab pre-selected
// ============================================================

function ComplianceIndicator({
  summary,
  memberId,
  basePath,
}: {
  summary: StaffListItem["compliance_summary"];
  memberId: string;
  basePath: string;
}) {
  const href = `${basePath}/${memberId}?tab=compliance`;
  if (summary.total === 0) {
    return (
      <Link
        href={href}
        className="text-xs text-muted-foreground hover:underline"
      >
        No docs
      </Link>
    );
  }
  if (summary.expired > 0) {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
      >
        <XCircle className="size-3.5" />
        {summary.expired} expired
      </Link>
    );
  }
  if (summary.pending > 0) {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-xs text-amber-600 hover:underline"
      >
        <AlertTriangle className="size-3.5" />
        {summary.pending} pending
      </Link>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
      <CheckCircle className="size-3.5" />
      All verified
    </span>
  );
}

// ============================================================
// Utilisation cell — bar + tooltip with past 4 weeks
// ============================================================

function UtilisationCell({ member }: { member: StaffListItem }) {
  if (member.role !== "coach") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const hours = member.hours_this_week;
  const tone = utilisationTone(hours);
  const pct = Math.min(100, Math.round((hours / 30) * 100));
  const history = member.hours_last_4_weeks;
  const tooltipBody =
    history.length === 4
      ? `Past 4 weeks: ${history[0]}h, ${history[1]}h, ${history[2]}h, ${history[3]}h`
      : `${hours}h this week`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="flex flex-col items-start gap-1 text-left"
            >
              <span className={`text-xs ${tone.text}`}>
                {hours.toFixed(1).replace(/\.0$/, "")}h <span className="text-muted-foreground">/ 30h</span>
              </span>
              <span className="block h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                <span
                  className={`block h-full ${tone.bar}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
              {tone.label && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {tone.label}
                </span>
              )}
            </button>
          }
        />
        <TooltipContent>{tooltipBody}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================
// Shift cell — next session if present, else last; flag 30+ days
// ============================================================

function ShiftCell({ member }: { member: StaffListItem }) {
  if (member.next_session_at) {
    return (
      <div className="flex flex-col text-xs">
        <span className="font-medium text-foreground">
          Next: {formatShiftLabel(member.next_session_at)}
        </span>
      </div>
    );
  }
  if (member.last_session_at) {
    const last = new Date(member.last_session_at);
    const days = daysBetween(last, new Date());
    const stale = days >= 30 && member.status === "active";
    return (
      <div className="flex flex-col text-xs">
        <span
          className={
            stale
              ? "inline-flex items-center gap-1 text-amber-700"
              : "text-muted-foreground"
          }
        >
          {stale && <AlertTriangle className="size-3" />}
          Last: {formatShiftLabel(member.last_session_at)}
        </span>
        {stale && (
          <span className="text-[10px] uppercase tracking-wide text-amber-700">
            Active 30+ days
          </span>
        )}
      </div>
    );
  }
  return (
    <span className="text-xs italic text-muted-foreground">Never rostered</span>
  );
}

// ============================================================
// Restore button — quick action for archived rows/cards. Calls
// reactivateStaffMember directly rather than routing through the
// detail page, since restoring from the Archive tab is meant to be
// a one-click action.
// ============================================================

function RestoreButton({
  id,
  onRestored,
}: {
  id: string;
  onRestored: () => void;
}) {
  const [working, setWorking] = useState(false);

  async function handleRestore(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setWorking(true);
    try {
      const { error } = await reactivateStaffMember(id);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Restored to active staff.");
      onRestored();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRestore}
      disabled={working}
    >
      <UserCheck className="size-3.5" />
      {working ? "Restoring…" : "Restore"}
    </Button>
  );
}

// ============================================================
// Grid view
// ============================================================

function StaffGridView({
  items,
  basePath,
  regionsById,
  section,
  onRestored,
}: {
  items: StaffListItem[];
  basePath: string;
  regionsById: Map<string, string>;
  section: "active" | "archive";
  onRestored: () => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((member) => {
        const statusStyle = STATUS_STYLES[member.status];
        const regionName = member.region_id
          ? regionsById.get(member.region_id) ?? null
          : null;
        return (
          <Link
            key={member.id}
            href={`${basePath}/${member.id}`}
            className="group rounded-2xl border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <Avatar size="lg">
                {member.photo_url && (
                  <AvatarImage src={member.photo_url} alt={member.name} />
                )}
                <AvatarFallback className="bg-[#E8712A] text-sm font-semibold text-white">
                  {getInitials(member.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {member.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {member.email}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {ROLE_LABELS[member.role]}
                  </Badge>
                  {member.credentials_purged_at ? (
                    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                      Permanently deleted
                    </span>
                  ) : (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle.className}`}
                    >
                      {statusStyle.label}
                    </span>
                  )}
                  {member.financial_access && (
                    <Badge
                      variant="secondary"
                      className="gap-1 border-[#E8712A]/40 bg-[#E8712A]/10 text-[10px] text-[#E8712A]"
                    >
                      <Banknote className="size-3" />
                      Finance
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            {regionName && (
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" />
                {regionName}
              </p>
            )}
            <div className="mt-3">
              <ComplianceIndicator
                summary={member.compliance_summary}
                memberId={member.id}
                basePath={basePath}
              />
            </div>
            {member.role === "coach" && (
              <div className="mt-3">
                <UtilisationCell member={member} />
              </div>
            )}
            <div className="mt-3">
              <ShiftCell member={member} />
            </div>
            {section === "archive" && !member.credentials_purged_at && (
              <div className="mt-3">
                <RestoreButton id={member.id} onRestored={onRestored} />
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

// ============================================================
// BulkActionBar
// ============================================================

function BulkActionBar({
  selectedIds,
  onClear,
  viewerRole,
  hasFinancialAccess,
  section,
  onCompleted,
}: {
  selectedIds: string[];
  onClear: () => void;
  viewerRole: UserRole;
  hasFinancialAccess: boolean;
  section: "active" | "archive";
  onCompleted: () => void;
}) {
  const count = selectedIds.length;
  const isAdmin = viewerRole === "admin";

  const [resetOpen, setResetOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [resetWorking, setResetWorking] = useState(false);
  const [archiveWorking, setArchiveWorking] = useState(false);
  const [csvWorking, setCsvWorking] = useState(false);

  async function handleReset() {
    setResetWorking(true);
    try {
      const { reset, errors, error } = await bulkResetPasswords(selectedIds);
      if (error && reset === 0) {
        toast.error(error);
        return;
      }
      if (errors.length > 0) {
        toast.warning(
          `Reset ${reset} of ${count}. ${errors.length} failed.`
        );
      } else {
        toast.success(`Reset passwords for ${reset} staff.`);
      }
      setResetOpen(false);
      onCompleted();
    } finally {
      setResetWorking(false);
    }
  }

  async function handleArchive() {
    setArchiveWorking(true);
    try {
      const { archived, errors, error } = await bulkArchiveStaff(selectedIds);
      if (error && archived === 0) {
        toast.error(error);
        return;
      }
      if (errors.length > 0) {
        toast.warning(
          `Deleted ${archived} of ${count}. ${errors.length} failed.`
        );
      } else {
        toast.success(`Deleted ${archived} staff.`);
      }
      setArchiveOpen(false);
      onCompleted();
    } finally {
      setArchiveWorking(false);
    }
  }

  async function handleExport() {
    setCsvWorking(true);
    try {
      const { csv, error } = await exportStaffCsv(selectedIds);
      if (error || !csv) {
        toast.error(error ?? "Failed to export.");
        return;
      }
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `staff-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${count} staff.`);
    } finally {
      setCsvWorking(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-[#E8712A]/40 bg-background px-4 py-3 shadow-lg ring-1 ring-[#E8712A]/20 sm:bottom-6 sm:right-6">
        <div className="flex items-center gap-3 pr-2 text-sm">
          <span className="font-medium text-foreground">
            {count} staff selected
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={onClear}
          >
            Clear
          </button>
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetOpen(true)}
          >
            <KeyRound className="size-4" />
            Reset passwords
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAnnounceOpen(true)}
        >
          <MessageSquarePlus className="size-4" />
          Send announcement
        </Button>
        {isAdmin && section === "active" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setArchiveOpen(true)}
          >
            <UserX className="size-4" />
            Delete
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleExport}
          disabled={csvWorking}
          className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
        >
          <FileDown className="size-4" />
          {csvWorking ? "Exporting…" : "Export CSV"}
          {hasFinancialAccess && (
            <span className="ml-1 text-[10px] opacity-80">+ finance</span>
          )}
        </Button>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reset passwords for {count} staff?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A new temporary password will be generated for each selected
              account. Email delivery is best-effort — share manually if
              delivery fails.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetWorking}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleReset();
              }}
              disabled={resetWorking}
              className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
            >
              {resetWorking ? "Resetting…" : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count} staff member{count === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each profile is signed out and moved to the Archive tab.
              Their details (sessions worked, swap requests, invoices) are
              kept — not erased — since staff records must be retained for
              7 years under Fair Work record-keeping requirements. You can
              restore them from the Archive at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveWorking}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleArchive();
              }}
              disabled={archiveWorking}
              className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
            >
              {archiveWorking ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkAnnouncementSheet
        open={announceOpen}
        onOpenChange={setAnnounceOpen}
        selectedIds={selectedIds}
        onDone={() => {
          setAnnounceOpen(false);
          onCompleted();
        }}
      />
    </>
  );
}

function BulkAnnouncementSheet({
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
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [working, setWorking] = useState(false);

  async function handleSend() {
    if (!title.trim() || !body.trim()) return;
    setWorking(true);
    try {
      const { sent, error } = await bulkSendStaffAnnouncement(
        selectedIds,
        title.trim(),
        body.trim()
      );
      if (error || sent === 0) {
        toast.error(error ?? "Failed to send.");
        return;
      }
      toast.success(
        `Notified ${sent} staff member${sent === 1 ? "" : "s"}.`
      );
      setTitle("");
      setBody("");
      onDone();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full max-w-md flex-col">
        <SheetHeader>
          <SheetTitle>Send announcement</SheetTitle>
          <SheetDescription>
            Posts an in-app notification to each of the {selectedIds.length}{" "}
            selected staff member{selectedIds.length === 1 ? "" : "s"}.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 px-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Team update"
            />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type the announcement..."
              rows={8}
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
            onClick={handleSend}
            disabled={working || !title.trim() || !body.trim()}
            className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
          >
            {working ? "Sending…" : "Send"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
