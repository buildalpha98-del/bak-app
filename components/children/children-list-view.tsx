"use client";

// ============================================================
// ChildrenListView
// ============================================================
//
// Shared list shell for both /admin/children and /ops/children. Drives:
//   - filter chip row (search, centre, age, status, region, parent
//     linked) with URL-state persistence so a filtered view is
//     shareable + refresh-safe
//   - jump-link chips from the status pulse (?new=this_week,
//     ?centres=none, ?assessment=overdue, ?inactive=30d)
//   - grid + table view modes (toggled via "view" query param)
//   - bulk-select on table view with a sticky action bar
//   - inline duplicate detection on the Add Child dialog
//   - row-as-link semantics (overlay anchor pattern) for keyboard
//     and right-click navigation
//
// Design language mirrors the close-outs in commits 80ce5a5 / 6cbfb6d
// / 821d102:
//   - rounded-2xl containers
//   - gap-6 between sections, gap-4 within
//   - brand orange (#E8712A) reserved for active filter chips, the
//     bulk-action bar, "Add Child", the view-toggle, and the
//     assessment-overdue badge

import { useState, useTransition, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Plus,
  Upload,
  Users,
  LayoutGrid,
  List,
  X,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CalendarOff,
  Building2,
  UserPlus,
  Mail,
  FileDown,
  CircleEllipsis,
  Link as LinkIcon,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Textarea } from "@/components/ui/textarea";

import {
  createChild,
  bulkLinkChildrenToCentre,
  bulkUpdateChildrenStatus,
  bulkMessageParents,
  exportChildrenCsv,
  inviteParentForChild,
} from "@/lib/children/actions";
import type { ChildListItem, AssessmentStatus } from "@/lib/children/actions";
import type { AgeGroup, ChildStatus, Gender } from "@/lib/types/enums";

interface RegionOption {
  id: string;
  name: string;
}

interface ChildrenListViewProps {
  children: ChildListItem[];
  centres: { id: string; name: string }[];
  basePath: string;
  regions?: RegionOption[];
}

const AGE_GROUPS: AgeGroup[] = ["3-5", "5-8", "8-12"];
const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

// ============================================================
// Helpers
// ============================================================

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

function getMonday(): Date {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatLastAttended(iso: string | null): { label: string; stale: boolean } {
  if (!iso) return { label: "Never", stale: true };
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const stale = days > 30;
  if (days < 1) return { label: "today", stale: false };
  if (days === 1) return { label: "yesterday", stale: false };
  if (days < 7) return { label: `${days}d ago`, stale: false };
  return {
    label: date.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
    stale,
  };
}

function assessmentBadge(status: AssessmentStatus) {
  switch (status) {
    case "done":
      return {
        label: "Done this term",
        icon: CheckCircle2,
        className:
          "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
      };
    case "pending":
      return {
        label: "Pending",
        icon: Clock,
        className:
          "border-amber-300/60 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
      };
    case "overdue":
      return {
        label: "Overdue",
        icon: AlertTriangle,
        className:
          "border-primary/40 bg-primary/10 text-primary",
      };
    case "no_term":
    default:
      return null;
  }
}

// ============================================================
// Component
// ============================================================

export default function ChildrenListView({
  children: initialChildren,
  centres,
  basePath,
  regions = [],
}: ChildrenListViewProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // ============================================================
  // URL-backed state
  // ============================================================

  const [search, setSearchState] = useState(params.get("search") ?? "");
  const [centreFilter, setCentreFilterState] = useState<string>(
    params.get("centre") ?? "all",
  );
  const [ageGroupFilter, setAgeGroupFilterState] = useState<string>(
    params.get("age") ?? "all",
  );
  const [statusFilter, setStatusFilterState] = useState<string>(
    params.get("status") ?? "all",
  );
  const [regionFilter, setRegionFilterState] = useState<string>(
    params.get("region") ?? "all",
  );
  const [parentFilter, setParentFilterState] = useState<string>(
    params.get("parent") ?? "all",
  );
  const [viewMode, setViewModeState] = useState<"grid" | "table">(
    params.get("view") === "grid" ? "grid" : "table",
  );

  // Pulse jump-link state (read-only chips with an X)
  const newThisWeek = params.get("new") === "this_week";
  const noCentre = params.get("centres") === "none";
  const assessmentOverdue = params.get("assessment") === "overdue";
  const inactive30d = params.get("inactive") === "30d";

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
    [params, router],
  );

  function setSearch(v: string) {
    setSearchState(v);
    replaceParam("search", v || null);
  }
  function setCentreFilter(v: string) {
    setCentreFilterState(v);
    replaceParam("centre", v === "all" ? null : v);
  }
  function setAgeGroupFilter(v: string) {
    setAgeGroupFilterState(v);
    replaceParam("age", v === "all" ? null : v);
  }
  function setStatusFilter(v: string) {
    setStatusFilterState(v);
    replaceParam("status", v === "all" ? null : v);
  }
  function setRegionFilter(v: string) {
    setRegionFilterState(v);
    replaceParam("region", v === "all" ? null : v);
  }
  function setParentFilter(v: string) {
    setParentFilterState(v);
    replaceParam("parent", v === "all" ? null : v);
  }
  function setViewMode(v: "grid" | "table") {
    setViewModeState(v);
    replaceParam("view", v === "table" ? null : v);
  }

  function clearJump(key: "new" | "centres" | "assessment" | "inactive") {
    replaceParam(key, null);
  }

  function clearAllFilters() {
    setSearchState("");
    setCentreFilterState("all");
    setAgeGroupFilterState("all");
    setStatusFilterState("all");
    setRegionFilterState("all");
    setParentFilterState("all");
    router.replace("?", { scroll: false });
  }

  const anyFilterActive =
    search.trim().length > 0 ||
    centreFilter !== "all" ||
    ageGroupFilter !== "all" ||
    statusFilter !== "all" ||
    regionFilter !== "all" ||
    parentFilter !== "all" ||
    newThisWeek ||
    noCentre ||
    assessmentOverdue ||
    inactive30d;

  // ============================================================
  // Bulk-select state
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
  // Dialog state — Add Child
  // ============================================================

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    age_group: "3-5" as AgeGroup,
    gender: "" as string,
    medical_notes: "",
    parent_name: "",
    parent_phone: "",
    parent_email: "",
  });
  const [selectedCentreIds, setSelectedCentreIds] = useState<string[]>([]);

  // Inline duplicate detection — surfaces when first/last + at least
  // one shared centre matches an existing child. Looks at the prop
  // (server-rendered list) so we don't need a round-trip on type.
  const potentialDuplicate = useMemo(() => {
    const first = formData.first_name.trim().toLowerCase();
    const last = formData.last_name.trim().toLowerCase();
    if (!first || !last || selectedCentreIds.length === 0) return null;
    const centreSet = new Set(selectedCentreIds);
    return (
      initialChildren.find((c) => {
        const sameName =
          c.first_name.toLowerCase() === first &&
          c.last_name.toLowerCase() === last;
        if (!sameName) return false;
        return c.centres.some((centre) => centreSet.has(centre.id));
      }) ?? null
    );
  }, [
    formData.first_name,
    formData.last_name,
    selectedCentreIds,
    initialChildren,
  ]);

  function resetForm() {
    setFormData({
      first_name: "",
      last_name: "",
      date_of_birth: "",
      age_group: "3-5",
      gender: "",
      medical_notes: "",
      parent_name: "",
      parent_phone: "",
      parent_email: "",
    });
    setSelectedCentreIds([]);
  }

  function toggleCentre(centreId: string) {
    setSelectedCentreIds((prev) =>
      prev.includes(centreId)
        ? prev.filter((id) => id !== centreId)
        : [...prev, centreId],
    );
  }

  function handleSubmit() {
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast.error("First name and last name are required.");
      return;
    }

    startTransition(async () => {
      const { error } = await createChild({
        first_name: formData.first_name,
        last_name: formData.last_name,
        date_of_birth: formData.date_of_birth || null,
        age_group: formData.age_group,
        gender: (formData.gender as Gender) || null,
        medical_notes: formData.medical_notes || null,
        parent_name: formData.parent_name || null,
        parent_phone: formData.parent_phone || null,
        parent_email: formData.parent_email || null,
        centre_ids: selectedCentreIds.length > 0 ? selectedCentreIds : undefined,
      });

      if (error) {
        toast.error(error);
      } else {
        toast.success("Child added successfully.");
        setDialogOpen(false);
        resetForm();
        router.refresh();
      }
    });
  }

  // ============================================================
  // Invite parent sheet — opened from "No parent" chip click
  // ============================================================

  const [inviteState, setInviteState] = useState<{
    open: boolean;
    childId: string | null;
    childName: string;
  }>({ open: false, childId: null, childName: "" });

  function openInvite(childId: string, childName: string) {
    setInviteState({ open: true, childId, childName });
  }

  // ============================================================
  // Derived filtered list
  // ============================================================

  const filtered = useMemo(() => {
    let result = initialChildren;
    const monday = getMonday();

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.first_name.toLowerCase().includes(term) ||
          c.last_name.toLowerCase().includes(term),
      );
    }

    if (centreFilter !== "all") {
      result = result.filter((c) =>
        c.centres.some((centre) => centre.id === centreFilter),
      );
    }

    if (ageGroupFilter !== "all") {
      result = result.filter((c) => c.age_group === ageGroupFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }

    if (regionFilter !== "all") {
      result = result.filter((c) => c.region_ids.includes(regionFilter));
    }

    if (parentFilter === "linked") {
      result = result.filter((c) => c.parents_total > 0);
    } else if (parentFilter === "none") {
      result = result.filter((c) => c.parents_total === 0);
    }

    // Pulse jump-link filters
    if (newThisWeek) {
      result = result.filter(
        (c) => new Date(c.created_at).getTime() >= monday.getTime(),
      );
    }
    if (noCentre) {
      result = result.filter((c) => c.centres.length === 0);
    }
    if (assessmentOverdue) {
      result = result.filter(
        (c) => c.status === "active" && c.assessment_status === "overdue",
      );
    }
    if (inactive30d) {
      result = result.filter((c) => {
        if (c.status !== "active") return false;
        if (!c.last_attended_at) return true;
        const days =
          (Date.now() - new Date(c.last_attended_at).getTime()) /
          (1000 * 60 * 60 * 24);
        return days > 30;
      });
    }

    return result;
  }, [
    initialChildren,
    search,
    centreFilter,
    ageGroupFilter,
    statusFilter,
    regionFilter,
    parentFilter,
    newThisWeek,
    noCentre,
    assessmentOverdue,
    inactive30d,
  ]);

  const allVisibleIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
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

  // Drop selection when flipping back to grid (no bulk bar there).
  useEffect(() => {
    if (viewMode !== "table" && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [viewMode, selectedIds.size]);

  const selectionActive = selectedIds.size > 0;

  // Build a centre-name lookup once for the bulk modal.
  const centreNameMap = useMemo(
    () => new Map(centres.map((c) => [c.id, c.name])),
    [centres],
  );

  const regionNameMap = useMemo(
    () => new Map(regions.map((r) => [r.id, r.name])),
    [regions],
  );

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Children</h1>
          <p className="text-sm text-muted-foreground">
            {initialChildren.length} child
            {initialChildren.length === 1 ? "" : "ren"} across all centres
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => router.push(`${basePath}/import`)}
          >
            <Upload className="size-4" />
            Import CSV
          </Button>
          <Button
            className="min-h-[44px] bg-primary text-white hover:bg-primary/90"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="size-4" />
            Add Child
          </Button>
        </div>
      </div>

      {/* Active jump-filter chips */}
      {(newThisWeek || noCentre || assessmentOverdue || inactive30d) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {newThisWeek && (
            <JumpChip
              icon={Sparkles}
              label="New this week"
              onClear={() => clearJump("new")}
            />
          )}
          {noCentre && (
            <JumpChip
              icon={Building2}
              label="No centre linked"
              onClear={() => clearJump("centres")}
            />
          )}
          {assessmentOverdue && (
            <JumpChip
              icon={AlertTriangle}
              label="Assessment overdue"
              onClear={() => clearJump("assessment")}
            />
          )}
          {inactive30d && (
            <JumpChip
              icon={CalendarOff}
              label="Inactive 30+ days"
              onClear={() => clearJump("inactive")}
            />
          )}
        </div>
      )}

      {/* Filters — chip-style wrapped in a calm rounded-2xl shell */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-[40px] pl-9"
          />
        </div>

        <Select
          value={centreFilter}
          onValueChange={(v) => setCentreFilter(v ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
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

        <Select
          value={ageGroupFilter}
          onValueChange={(v) => setAgeGroupFilter(v ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Age" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ages</SelectItem>
            {AGE_GROUPS.map((ag) => (
              <SelectItem key={ag} value={ag}>
                {ag} years
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {regions.length > 0 && (
          <Select
            value={regionFilter}
            onValueChange={(v) => setRegionFilter(v ?? "all")}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={parentFilter}
          onValueChange={(v) => setParentFilter(v ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Parent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any parent state</SelectItem>
            <SelectItem value="linked">Parent linked</SelectItem>
            <SelectItem value="none">No parent</SelectItem>
          </SelectContent>
        </Select>

        {/* View toggle — restrained orange when active */}
        <div className="flex rounded-lg border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewMode("table")}
            aria-label="Table view"
            className={
              viewMode === "table"
                ? "rounded-r-none bg-primary/10 text-primary hover:bg-primary/15"
                : "rounded-r-none"
            }
          >
            <List className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
            className={
              viewMode === "grid"
                ? "rounded-l-none bg-primary/10 text-primary hover:bg-primary/15"
                : "rounded-l-none"
            }
          >
            <LayoutGrid className="size-4" />
          </Button>
        </div>

        {anyFilterActive && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/30 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/40"
          >
            <X className="size-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border py-16 text-center">
          <Users className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            {initialChildren.length === 0
              ? "No children have been added yet."
              : "No children match your filters."}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((child) => {
            const selected = selectedIds.has(child.id);
            const last = formatLastAttended(child.last_attended_at);
            const assess = assessmentBadge(child.assessment_status);
            const childName = `${child.first_name} ${child.last_name}`;
            return (
              <div
                key={child.id}
                className={
                  "group relative flex flex-col gap-3 rounded-2xl border bg-background p-4 transition hover:shadow-md hover:-translate-y-0.5 " +
                  (selected ? "ring-1 ring-primary/40" : "")
                }
              >
                {selectionActive ? (
                  // While a selection is active, clicking a card
                  // toggles selection (matches the centres/staff pattern).
                  <button
                    type="button"
                    aria-label={`Select ${childName}`}
                    onClick={() => toggleSelect(child.id)}
                    className="absolute inset-0 rounded-2xl"
                  />
                ) : (
                  <Link
                    href={`${basePath}/${child.id}`}
                    className="absolute inset-0 rounded-2xl"
                    aria-label={`View ${childName}`}
                  />
                )}

                <div className="relative z-10 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarFallback className="bg-muted text-sm font-semibold text-foreground">
                        {initials(childName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium leading-tight">{childName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary">
                          {child.age_group} yrs
                        </Badge>
                        {child.status !== "active" && (
                          <Badge variant="destructive">
                            {child.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {child.has_recent_insight && (
                    <Link
                      href={`${basePath}/${child.id}?tab=insights`}
                      className="relative z-20 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                      title="Insight ready"
                    >
                      <Sparkles className="size-3" />
                      Insight
                    </Link>
                  )}
                </div>

                {child.centres.length > 0 ? (
                  <div className="relative z-10 flex flex-wrap gap-1">
                    {child.centres.slice(0, 2).map((c) => (
                      <Badge key={c.id} variant="outline">
                        {c.name}
                      </Badge>
                    ))}
                    {child.centres.length > 2 && (
                      <Badge variant="outline">
                        +{child.centres.length - 2}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <p className="relative z-10 text-xs text-muted-foreground">
                    No centres linked
                  </p>
                )}

                <div className="relative z-10 flex flex-wrap items-center gap-2 text-xs">
                  {child.parents_total > 0 ? (
                    <div className="inline-flex items-center gap-1">
                      <Avatar className="size-5">
                        <AvatarFallback className="bg-muted text-[10px] font-semibold">
                          {initials(child.parents[0]?.name ?? "Parent")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-muted-foreground">
                        {child.parents[0]?.name ?? "Parent"}
                        {child.parents_total > 1 &&
                          ` +${child.parents_total - 1}`}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openInvite(
                          child.id,
                          `${child.first_name} ${child.last_name}`,
                        );
                      }}
                      className="relative z-20 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/40"
                    >
                      <UserPlus className="size-3" />
                      No parent
                    </button>
                  )}
                  {child.region_ids.length > 0 && (
                    <Badge variant="outline" className="font-normal">
                      {regionNameMap.get(child.region_ids[0]) ?? "Region"}
                      {child.region_ids.length > 1 &&
                        ` +${child.region_ids.length - 1}`}
                    </Badge>
                  )}
                </div>

                <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 text-xs">
                  {assess && (
                    <span
                      className={
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium " +
                        assess.className
                      }
                    >
                      <assess.icon className="size-3" />
                      {assess.label}
                    </span>
                  )}
                  <span
                    className={
                      last.stale
                        ? "text-primary"
                        : "text-muted-foreground"
                    }
                  >
                    Last attended {last.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border">
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
                <TableHead className="hidden md:table-cell">
                  Age
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  Centres
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  Parent
                </TableHead>
                <TableHead>Assessment</TableHead>
                <TableHead className="hidden md:table-cell">
                  Last attended
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((child) => {
                const selected = selectedIds.has(child.id);
                const last = formatLastAttended(child.last_attended_at);
                const assess = assessmentBadge(child.assessment_status);
                const childName = `${child.first_name} ${child.last_name}`;
                return (
                  <TableRow
                    key={child.id}
                    className={
                      "relative transition hover:bg-muted/30 " +
                      (last.stale && !last.label.includes("yrs")
                        ? "bg-muted/10 "
                        : "") +
                      (selected ? "bg-primary/5" : "")
                    }
                    data-state={selected ? "selected" : undefined}
                  >
                    <TableCell
                      className="relative z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleSelect(child.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${childName}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{childName}</span>
                        {child.has_recent_insight && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                            title="Insight ready"
                          >
                            <Sparkles className="size-2.5" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary">
                        {child.age_group} yrs
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex flex-wrap items-center gap-1">
                        {child.centres.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            None
                          </span>
                        ) : (
                          <>
                            {child.centres.slice(0, 2).map((c) => (
                              <Badge key={c.id} variant="outline">
                                {c.name}
                              </Badge>
                            ))}
                            {child.centres.length > 2 && (
                              <Badge variant="outline">
                                +{child.centres.length - 2}
                              </Badge>
                            )}
                            {child.region_ids.length > 0 && (
                              <Badge
                                variant="outline"
                                className="font-normal text-muted-foreground"
                              >
                                {regionNameMap.get(child.region_ids[0]) ??
                                  "Region"}
                                {child.region_ids.length > 1 &&
                                  ` +${child.region_ids.length - 1}`}
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {child.parents_total > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex -space-x-1">
                            {child.parents.slice(0, 2).map((p) => (
                              <Avatar
                                key={p.id}
                                className="size-6 border-2 border-background"
                              >
                                <AvatarFallback className="bg-muted text-[10px] font-semibold">
                                  {initials(p.name)}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                          {child.parents_total > 2 && (
                            <span className="text-xs text-muted-foreground">
                              +{child.parents_total - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openInvite(child.id, childName);
                          }}
                          className="relative z-20 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/40"
                        >
                          <UserPlus className="size-3" />
                          No parent
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      {assess ? (
                        <span
                          className={
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium " +
                            assess.className
                          }
                        >
                          <assess.icon className="size-3" />
                          {assess.label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span
                        className={
                          last.stale && child.last_attended_at !== null
                            ? "text-xs text-primary"
                            : !child.last_attended_at
                              ? "text-xs text-muted-foreground"
                              : "text-xs text-foreground"
                        }
                      >
                        {last.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          child.status === "active" ? "default" : "destructive"
                        }
                      >
                        {child.status}
                      </Badge>
                      {/* Overlay link covers the whole row for keyboard
                          + right-click nav. Checkbox sits above via
                          z-10 + stopPropagation. It lives inside this
                          cell because an <a> is invalid as a child of
                          <tr> — the parser relocates it and hydration
                          breaks (React #418). The cell is statically
                          positioned, so inset-0 still resolves against
                          the relative <tr>. */}
                      <Link
                        href={`${basePath}/${child.id}`}
                        className="absolute inset-0"
                        aria-label={`View ${childName}`}
                        onClick={(e) => {
                          if (selectionActive) {
                            e.preventDefault();
                            toggleSelect(child.id);
                          }
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {initialChildren.length} children
      </p>

      {/* Sticky bulk-action bar (table view only) */}
      {viewMode === "table" && selectionActive && (
        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          centres={centres}
          centreNameMap={centreNameMap}
          onClear={clearSelection}
          onCompleted={() => {
            clearSelection();
            router.refresh();
          }}
        />
      )}

      {/* Add Child dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Child</DialogTitle>
            <DialogDescription>
              Create a new child record and optionally assign them to
              centres.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First name *</Label>
                <Input
                  id="first_name"
                  className="min-h-[44px]"
                  value={formData.first_name}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      first_name: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last name *</Label>
                <Input
                  id="last_name"
                  className="min-h-[44px]"
                  value={formData.last_name}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      last_name: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dob">Date of birth</Label>
                <Input
                  id="dob"
                  type="date"
                  className="min-h-[44px]"
                  value={formData.date_of_birth}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      date_of_birth: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age_group">Age group *</Label>
                <Select
                  value={formData.age_group}
                  onValueChange={(v) =>
                    setFormData((p) => ({
                      ...p,
                      age_group: v as AgeGroup,
                    }))
                  }
                >
                  <SelectTrigger id="age_group" className="min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGE_GROUPS.map((ag) => (
                      <SelectItem key={ag} value={ag}>
                        {ag} years
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select
                value={formData.gender}
                onValueChange={(v) =>
                  setFormData((p) => ({ ...p, gender: v as string }))
                }
              >
                <SelectTrigger id="gender" className="min-h-[44px]">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="medical_notes">Medical notes</Label>
              <Textarea
                id="medical_notes"
                placeholder="Allergies, conditions, etc."
                value={formData.medical_notes}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    medical_notes: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parent_name">Parent / guardian name</Label>
              <Input
                id="parent_name"
                className="min-h-[44px]"
                value={formData.parent_name}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    parent_name: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="parent_phone">Parent phone</Label>
                <Input
                  id="parent_phone"
                  type="tel"
                  className="min-h-[44px]"
                  value={formData.parent_phone}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      parent_phone: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parent_email">Parent email</Label>
                <Input
                  id="parent_email"
                  type="email"
                  className="min-h-[44px]"
                  value={formData.parent_email}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      parent_email: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {centres.length > 0 && (
              <div className="space-y-2">
                <Label>Assign to centres</Label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                  {centres.map((centre) => (
                    <div
                      key={centre.id}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`centre-${centre.id}`}
                        checked={selectedCentreIds.includes(centre.id)}
                        onCheckedChange={() => toggleCentre(centre.id)}
                      />
                      <Label
                        htmlFor={`centre-${centre.id}`}
                        className="cursor-pointer text-sm font-normal"
                      >
                        {centre.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {potentialDuplicate && (
              <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  Possible duplicate
                </p>
                <p className="mt-1 text-amber-800 dark:text-amber-200">
                  A child named{" "}
                  <span className="font-medium">
                    {potentialDuplicate.first_name}{" "}
                    {potentialDuplicate.last_name}
                  </span>{" "}
                  is already linked to{" "}
                  <span className="font-medium">
                    {potentialDuplicate.centres
                      .filter((c) => selectedCentreIds.includes(c.id))
                      .map((c) => c.name)
                      .join(", ")}
                  </span>
                  .{" "}
                  <Link
                    href={`${basePath}/${potentialDuplicate.id}`}
                    className="inline-flex items-center gap-0.5 font-medium underline"
                  >
                    View existing
                    <ExternalLink className="size-3" />
                  </Link>
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              className="min-h-[44px] bg-primary text-white hover:bg-primary/90"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Add Child"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite parent sheet */}
      <InviteParentSheet
        state={inviteState}
        onOpenChange={(open) =>
          setInviteState((prev) => ({ ...prev, open }))
        }
        onDone={() => {
          setInviteState({ open: false, childId: null, childName: "" });
          router.refresh();
        }}
      />
    </div>
  );
}

// ============================================================
// JumpChip — removable orange-tinted pulse-link chip
// ============================================================

function JumpChip({
  icon: Icon,
  label,
  onClear,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
      <Icon className="size-3" />
      {label}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
        aria-label={`Clear ${label} filter`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

// ============================================================
// BulkActionBar — fixed bottom-right, brand orange ring
// ============================================================

function BulkActionBar({
  selectedIds,
  centres,
  centreNameMap,
  onClear,
  onCompleted,
}: {
  selectedIds: string[];
  centres: { id: string; name: string }[];
  centreNameMap: Map<string, string>;
  onClear: () => void;
  onCompleted: () => void;
}) {
  const count = selectedIds.length;
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkCentreId, setLinkCentreId] = useState<string>("");
  const [linkWorking, setLinkWorking] = useState(false);

  const [statusOpen, setStatusOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ChildStatus>("active");
  const [statusWorking, setStatusWorking] = useState(false);

  const [messageOpen, setMessageOpen] = useState(false);

  const [csvWorking, setCsvWorking] = useState(false);

  async function handleLinkConfirm() {
    if (!linkCentreId) {
      toast.error("Select a centre.");
      return;
    }
    setLinkWorking(true);
    try {
      const { linked, alreadyLinked, error } = await bulkLinkChildrenToCentre(
        selectedIds,
        linkCentreId,
      );
      if (error && linked === 0) {
        toast.error(error);
        return;
      }
      const centreName = centreNameMap.get(linkCentreId) ?? "centre";
      if (linked > 0) {
        toast.success(
          `Linked ${linked} child${linked === 1 ? "" : "ren"} to ${centreName}.`,
        );
      } else {
        toast.info(
          `All ${alreadyLinked} child${alreadyLinked === 1 ? " was" : "ren were"} already linked.`,
        );
      }
      setLinkOpen(false);
      setLinkCentreId("");
      onCompleted();
    } finally {
      setLinkWorking(false);
    }
  }

  async function handleStatusConfirm() {
    setStatusWorking(true);
    try {
      const { updated, error } = await bulkUpdateChildrenStatus(
        selectedIds,
        pendingStatus,
      );
      if (error && updated === 0) {
        toast.error(error);
        return;
      }
      toast.success(
        `Updated ${updated} child${updated === 1 ? "" : "ren"} → ${pendingStatus}.`,
      );
      setStatusOpen(false);
      onCompleted();
    } finally {
      setStatusWorking(false);
    }
  }

  async function handleExport() {
    setCsvWorking(true);
    try {
      const { csv, error } = await exportChildrenCsv(selectedIds);
      if (error || !csv) {
        toast.error(error ?? "Failed to export.");
        return;
      }
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `children-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${count} child${count === 1 ? "" : "ren"}.`);
    } finally {
      setCsvWorking(false);
    }
  }

  return (
    <>
      <div
        className={
          "fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-background px-4 py-3 shadow-lg ring-1 ring-primary/20 sm:bottom-6 sm:right-6"
        }
      >
        <div className="flex items-center gap-3 pr-2 text-sm">
          <span className="font-medium text-foreground">
            {count} child{count === 1 ? "" : "ren"} selected
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={onClear}
          >
            Clear
          </button>
        </div>

        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm">
                <LinkIcon className="size-4" />
                Link to centre
              </Button>
            }
          />
          <PopoverContent align="end" className="w-72">
            <div className="space-y-2">
              <Label className="text-xs">Choose a centre</Label>
              <Select
                value={linkCentreId}
                onValueChange={(v) => setLinkCentreId(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a centre" />
                </SelectTrigger>
                <SelectContent>
                  {centres.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleLinkConfirm}
                disabled={linkWorking || !linkCentreId}
                className="w-full bg-primary text-white hover:bg-primary/90"
              >
                {linkWorking ? "Linking…" : "Link"}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setStatusOpen(true)}
        >
          <CircleEllipsis className="size-4" />
          Change status
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setMessageOpen(true)}
        >
          <Mail className="size-4" />
          Message parents
        </Button>

        <Button
          size="sm"
          onClick={handleExport}
          disabled={csvWorking}
          className="bg-primary text-white hover:bg-primary/90"
        >
          <FileDown className="size-4" />
          {csvWorking ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      {/* Change-status confirmation */}
      <AlertDialog open={statusOpen} onOpenChange={setStatusOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Change status for {count} child{count === 1 ? "" : "ren"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The new status will apply to every selected child, and
              each change is recorded in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>New status</Label>
            <Select
              value={pendingStatus}
              onValueChange={(v) => setPendingStatus(v as ChildStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusWorking}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleStatusConfirm();
              }}
              disabled={statusWorking}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {statusWorking ? "Saving…" : "Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkMessageSheet
        open={messageOpen}
        onOpenChange={setMessageOpen}
        selectedIds={selectedIds}
        onDone={() => {
          setMessageOpen(false);
          onCompleted();
        }}
      />
    </>
  );
}

// ============================================================
// BulkMessageSheet — broadcast to linked parents
// ============================================================

function BulkMessageSheet({
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
      const { notified, uniqueParents, error } = await bulkMessageParents(
        selectedIds,
        title.trim(),
        body.trim(),
      );
      if (error && notified === 0) {
        toast.error(error);
        return;
      }
      toast.success(
        `Reached ${notified} parent${notified === 1 ? "" : "s"} (${uniqueParents} linked).`,
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
          <SheetTitle>Message parents</SheetTitle>
          <SheetDescription>
            Sent as in-app notifications to every parent linked to the{" "}
            {selectedIds.length} selected child
            {selectedIds.length === 1 ? "" : "ren"}.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-3 px-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Holiday break reminder"
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
            className="bg-primary text-white hover:bg-primary/90"
          >
            {working ? "Sending…" : "Send"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// InviteParentSheet — create parent + link + dispatch magic link
// ============================================================

function InviteParentSheet({
  state,
  onOpenChange,
  onDone,
}: {
  state: { open: boolean; childId: string | null; childName: string };
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [working, setWorking] = useState(false);

  // Reset form when sheet closes — keep the open call snappy
  useEffect(() => {
    if (!state.open) {
      setFirstName("");
      setLastName("");
      setEmail("");
    }
  }, [state.open]);

  async function handleInvite() {
    if (!state.childId) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error("First name, last name, and email are required.");
      return;
    }
    setWorking(true);
    try {
      const { error } = await inviteParentForChild(state.childId, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
      });
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`Magic-link sent to ${email.trim().toLowerCase()}.`);
      onDone();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Sheet open={state.open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full max-w-md flex-col">
        <SheetHeader>
          <SheetTitle>Invite parent</SheetTitle>
          <SheetDescription>
            {state.childName
              ? `Create a parent profile linked to ${state.childName} and send a magic-link sign-in email.`
              : "Create a parent profile linked to this child and send a magic-link sign-in email."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-3 px-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>First name</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Last name</Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
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
            onClick={handleInvite}
            disabled={working}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {working ? "Sending…" : "Send invite"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
