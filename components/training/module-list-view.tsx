"use client";

// ============================================================
// ModuleListView
// ============================================================
//
// Shared library shell for the Modules tab of /admin/training (and
// /ops/training). Matches the design language from the prior
// close-outs (centres / staff / children / performance / assessments
// / programmes):
//   - filter chip row (search, type, status, required) with URL-state
//     persistence so a filtered view is shareable + refresh-safe
//   - jump-link chips from the status pulse
//     (?due=overdue, ?required=yes&status=published, ?new=this_week)
//   - bulk-select on the table view with sticky orange action bar
//     (Publish / Archive / Assign to coaches / Export CSV)
//   - row-as-link overlay for keyboard / right-click / open-in-new-tab
//
// Design language:
//   - rounded-2xl containers
//   - gap-6 between sections
//   - brand orange (#E8712A) reserved for: Create CTA, active jump
//     chips, "Required" badge, "Overdue" pulse, bulk-action bar.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  bulkArchiveTrainingModules,
  bulkAssignTrainingModulesToAllCoaches,
  bulkPublishTrainingModules,
  exportTrainingModulesCsv,
} from "@/lib/training/actions";
import type { TrainingModule } from "@/lib/types/database";
import type {
  TrainingCategory,
  TrainingModuleType,
  TrainingStatus,
} from "@/lib/types/enums";

interface ModuleListViewProps {
  initialModules: TrainingModule[];
  basePath: string;
}

const TYPE_BADGE: Record<TrainingModuleType, { label: string; className: string }> = {
  video:     { label: "Video",     className: "bg-blue-100 text-blue-700" },
  document:  { label: "Document",  className: "bg-purple-100 text-purple-700" },
  quiz:      { label: "Quiz",      className: "bg-amber-100 text-amber-700" },
  checklist: { label: "Checklist", className: "bg-emerald-100 text-emerald-700" },
};

const STATUS_BADGE: Record<TrainingStatus, { label: string; className: string }> = {
  draft:     { label: "Draft",     className: "bg-secondary text-muted-foreground" },
  published: { label: "Published", className: "bg-emerald-100 text-emerald-700" },
  archived:  { label: "Archived",  className: "bg-neutral-100 text-neutral-500" },
};

const CATEGORY_LABEL: Record<TrainingCategory, string> = {
  onboarding:               "Onboarding",
  sport_specific:           "Sport Specific",
  compliance:               "Compliance",
  professional_development: "Professional Development",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getMondayDate(): Date {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// ============================================================
// Component
// ============================================================

export function ModuleListView({ initialModules, basePath }: ModuleListViewProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  // ============================================================
  // URL-backed filter state
  // ============================================================

  const [search, setSearchState] = useState(params.get("search") ?? "");
  const [typeFilter, setTypeFilterState] = useState<TrainingModuleType | "all">(
    (params.get("type") as TrainingModuleType | null) ?? "all",
  );
  const [statusFilter, setStatusFilterState] = useState<TrainingStatus | "all">(
    (params.get("status") as TrainingStatus | null) ?? "all",
  );
  // Required: "all" | "yes" | "no". URL stores "yes" / "no".
  const [requiredFilter, setRequiredFilterState] = useState<"all" | "yes" | "no">(
    (params.get("required") as "yes" | "no" | null) ?? "all",
  );

  // Pulse jump-link state
  const dueOverdue = params.get("due") === "overdue";
  const newThisWeek = params.get("new") === "this_week";

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
  function setTypeFilter(v: TrainingModuleType | "all") {
    setTypeFilterState(v);
    replaceParam("type", v === "all" ? null : v);
  }
  function setStatusFilter(v: TrainingStatus | "all") {
    setStatusFilterState(v);
    replaceParam("status", v === "all" ? null : v);
  }
  function setRequiredFilter(v: "all" | "yes" | "no") {
    setRequiredFilterState(v);
    replaceParam("required", v === "all" ? null : v);
  }
  function clearJump(key: "due" | "new") {
    replaceParam(key, null);
  }
  function clearAllFilters() {
    setSearchState("");
    setTypeFilterState("all");
    setStatusFilterState("all");
    setRequiredFilterState("all");
    // Preserve the tab param so we don't bounce away from Modules.
    const tab = params.get("tab");
    router.replace(tab ? `?tab=${tab}` : "?", { scroll: false });
  }

  const anyFilterActive =
    search.trim().length > 0 ||
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    requiredFilter !== "all" ||
    dueOverdue ||
    newThisWeek;

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
  // Derived list
  // ============================================================

  const filtered = useMemo(() => {
    let result = [...initialModules];
    const monday = getMondayDate();

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.description?.toLowerCase().includes(q) ?? false),
      );
    }

    if (typeFilter !== "all") {
      result = result.filter((m) => m.type === typeFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter((m) => m.status === statusFilter);
    }

    if (requiredFilter === "yes") {
      result = result.filter((m) => m.is_mandatory);
    } else if (requiredFilter === "no") {
      result = result.filter((m) => !m.is_mandatory);
    }

    if (newThisWeek) {
      result = result.filter(
        (m) => new Date(m.created_at).getTime() >= monday.getTime(),
      );
    }
    // `dueOverdue` is purely a UI label — the list of modules itself
    // doesn't have a due date, so we surface it as an active chip
    // but don't try to filter modules by it. The chip links to a
    // pre-filtered view of /admin/training/assignments via the pulse.

    return result;
  }, [
    initialModules,
    search,
    typeFilter,
    statusFilter,
    requiredFilter,
    newThisWeek,
  ]);

  const allVisibleIds = useMemo(() => filtered.map((m) => m.id), [filtered]);
  const allVisibleSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));

  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(allVisibleIds));
  }

  // Drop selection when the filtered set changes and our selection
  // would refer to rows that aren't visible (e.g. switched filters).
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visible = new Set(allVisibleIds);
    let trimmed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (visible.has(id)) next.add(id);
      else trimmed = true;
    }
    if (trimmed) setSelectedIds(next);
  }, [allVisibleIds, selectedIds]);

  const selectionActive = selectedIds.size > 0;

  // ============================================================
  // Empty (org has zero modules)
  // ============================================================

  if (initialModules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border bg-background py-16 text-center">
        <BookOpen className="mb-3 size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">No modules yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Create a video, document, quiz or checklist to start the library.
        </p>
        <div className="mt-4">
          <Button
            render={<Link href={`${basePath}/modules/new`} />}
            className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
          >
            <Plus className="size-4" />
            Create Module
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active jump-filter chips */}
      {(dueOverdue || newThisWeek) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {dueOverdue && (
            <JumpChip
              icon={AlertTriangle}
              label="Overdue assignments"
              onClear={() => clearJump("due")}
            />
          )}
          {newThisWeek && (
            <JumpChip
              icon={Sparkles}
              label="New this week"
              onClear={() => clearJump("new")}
            />
          )}
        </div>
      )}

      {/* Filters — chip-style wrapped in a calm rounded-2xl shell */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-[40px] pl-9"
          />
        </div>

        <Select
          value={typeFilter}
          onValueChange={(v) =>
            setTypeFilter((v ?? "all") as TrainingModuleType | "all")
          }
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="document">Document</SelectItem>
            <SelectItem value="quiz">Quiz</SelectItem>
            <SelectItem value="checklist">Checklist</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) =>
            setStatusFilter((v ?? "all") as TrainingStatus | "all")
          }
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={requiredFilter}
          onValueChange={(v) => setRequiredFilter((v ?? "all") as "all" | "yes" | "no")}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Required" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            <SelectItem value="yes">Required only</SelectItem>
            <SelectItem value="no">Optional only</SelectItem>
          </SelectContent>
        </Select>

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

        <div className="sm:ml-auto">
          <Button
            render={<Link href={`${basePath}/modules/new`} />}
            className="min-h-[40px] bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
          >
            <Plus className="size-4" />
            Create Module
          </Button>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border bg-background py-16 text-center">
          <Search className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No modules match your filters.
          </p>
        </div>
      ) : (
        <ModuleTable
          modules={filtered}
          basePath={basePath}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          allVisibleSelected={allVisibleSelected}
          selectionActive={selectionActive}
        />
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {initialModules.length} module
        {initialModules.length === 1 ? "" : "s"}
      </p>

      {/* Sticky bulk-action bar — visible on selection */}
      {selectionActive && (
        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          onClear={clearSelection}
          onCompleted={() => {
            clearSelection();
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// JumpChip — orange-tinted removable pulse-link chip
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
    <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2.5 py-1 text-xs font-medium text-[#E8712A]">
      <Icon className="size-3" />
      {label}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full p-0.5 hover:bg-[#E8712A]/20"
        aria-label={`Clear ${label} filter`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

// ============================================================
// ModuleTable — desktop table + mobile card list
// ============================================================

function ModuleTable({
  modules,
  basePath,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allVisibleSelected,
  selectionActive,
}: {
  modules: TrainingModule[];
  basePath: string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  allVisibleSelected: boolean;
  selectionActive: boolean;
}) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden rounded-2xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[36px]">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) =>
                    onToggleSelectAll(checked === true)
                  }
                  aria-label="Select all visible"
                />
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.map((m) => {
              const selected = selectedIds.has(m.id);
              const typeBadge = TYPE_BADGE[m.type];
              const statusBadge = STATUS_BADGE[m.status];
              return (
                <TableRow
                  key={m.id}
                  className={
                    "relative transition hover:bg-muted/30 " +
                    (selected ? "bg-[#E8712A]/5" : "")
                  }
                  data-state={selected ? "selected" : undefined}
                >
                  <TableCell
                    className="relative z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => onToggleSelect(m.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${m.title}`}
                    />
                  </TableCell>
                  <TableCell className="max-w-[320px] font-medium">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{m.title}</span>
                      {m.is_mandatory && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#E8712A]"
                          title="Required module"
                        >
                          Required
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={typeBadge.className}>
                      {typeBadge.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {CATEGORY_LABEL[m.category]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusBadge.className}>
                      {statusBadge.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(m.created_at)}
                  </TableCell>
                  <Link
                    href={`${basePath}/modules/${m.id}/edit`}
                    className="absolute inset-0"
                    aria-label={`Edit ${m.title}`}
                    onClick={(e) => {
                      if (selectionActive) {
                        e.preventDefault();
                        onToggleSelect(m.id);
                      }
                    }}
                  />
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile — 1-column card list under md */}
      <div className="grid gap-3 md:hidden">
        {modules.map((m) => {
          const selected = selectedIds.has(m.id);
          const typeBadge = TYPE_BADGE[m.type];
          const statusBadge = STATUS_BADGE[m.status];
          return (
            <div
              key={m.id}
              className={
                "relative flex flex-col gap-2 rounded-2xl border bg-background p-4 transition hover:shadow-md " +
                (selected ? "bg-[#E8712A]/5 " : "") +
                (m.is_mandatory ? "ring-1 ring-[#E8712A]/30" : "")
              }
            >
              <div className="flex items-start gap-2">
                <div
                  className="relative z-10 pt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => onToggleSelect(m.id)}
                    aria-label={`Select ${m.title}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-tight">{m.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge className={typeBadge.className}>
                      {typeBadge.label}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {CATEGORY_LABEL[m.category]}
                    </Badge>
                    <Badge className={statusBadge.className}>
                      {statusBadge.label}
                    </Badge>
                    {m.is_mandatory && (
                      <span className="inline-flex items-center rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#E8712A]">
                        Required
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Added {formatDate(m.created_at)}
              </p>
              <Link
                href={`${basePath}/modules/${m.id}/edit`}
                className="absolute inset-0 rounded-2xl"
                aria-label={`Edit ${m.title}`}
                onClick={(e) => {
                  if (selectionActive) {
                    e.preventDefault();
                    onToggleSelect(m.id);
                  }
                }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

// ============================================================
// BulkActionBar — fixed bottom-right, brand orange ring
// ============================================================

function BulkActionBar({
  selectedIds,
  onClear,
  onCompleted,
}: {
  selectedIds: string[];
  onClear: () => void;
  onCompleted: () => void;
}) {
  const count = selectedIds.length;
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  async function handlePublish() {
    setPublishing(true);
    try {
      const result = await bulkPublishTrainingModules(selectedIds);
      if (result.error && result.published === 0) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Published ${result.published} module${result.published === 1 ? "" : "s"}` +
          (result.errors.length ? ` (${result.errors.length} skipped).` : "."),
      );
      onCompleted();
    } finally {
      setPublishing(false);
    }
  }

  async function handleAssign() {
    setAssigning(true);
    try {
      const result = await bulkAssignTrainingModulesToAllCoaches(selectedIds);
      if (result.error && result.assignments === 0) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Assigned ${result.assignments} new training assignment${result.assignments === 1 ? "" : "s"}.`,
      );
      onCompleted();
    } finally {
      setAssigning(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { csv, error } = await exportTrainingModulesCsv(selectedIds);
      if (error || !csv) {
        toast.error(error ?? "Export failed.");
        return;
      }
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `training-modules-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${selectedIds.length} module${selectedIds.length === 1 ? "" : "s"}.`,
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      const result = await bulkArchiveTrainingModules(selectedIds);
      if (result.error && result.archived === 0) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Archived ${result.archived} module${result.archived === 1 ? "" : "s"}` +
          (result.errors.length ? ` (${result.errors.length} skipped).` : "."),
      );
      setArchiveOpen(false);
      onCompleted();
    } finally {
      setArchiving(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-[#E8712A]/40 bg-background px-4 py-3 shadow-lg ring-1 ring-[#E8712A]/20 sm:bottom-6 sm:right-6">
        <div className="flex items-center gap-3 pr-2 text-sm">
          <span className="font-medium text-foreground">
            {count} module{count === 1 ? "" : "s"} selected
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
          disabled={publishing}
        >
          {publishing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          Publish
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleAssign}
          disabled={assigning}
        >
          {assigning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Assign to coaches
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Export CSV
        </Button>

        <Button
          size="sm"
          onClick={() => setArchiveOpen(true)}
          className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
        >
          <Trash2 className="size-4" />
          Archive
        </Button>
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive {count} module{count === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Modules will be hidden from the library. Existing assignments and
              completions are preserved. You can republish a module by editing
              it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleArchive();
              }}
              className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
              disabled={archiving}
            >
              {archiving ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 size-4" />
              )}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
