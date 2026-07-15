"use client";

// ============================================================
// AssessmentListView
// ============================================================
//
// Shared list shell for both /admin/assessments and /ops/assessments.
// Mirrors the design language from the prior close-outs (centres /
// staff / children / performance):
//   - filter chip row (search, sport, age, term, status) with
//     URL-state persistence so a filtered view is shareable +
//     refresh-safe
//   - jump-link chips from the status pulse (?skills=empty,
//     ?pending=term, ?coaches=silent, ?new=this_week)
//   - grid + table view modes (toggled via "view" query param)
//   - bulk-select on table view with a sticky action bar
//     (Duplicate / Delete)
//   - inline duplicate detection on the Create dialog
//   - row-as-link (overlay anchor) for keyboard / right-click nav
//
// Design language:
//   - rounded-2xl containers
//   - gap-6 between sections, gap-3 within
//   - brand orange (#E8712A) reserved for the Create CTA, the
//     bulk-action bar, active view toggle, "Save" submit, and a
//     subtle ring on skills=empty rows. Restrained.

import {
  useState,
  useMemo,
  useTransition,
  useCallback,
  useEffect,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Plus,
  ClipboardList,
  Loader2,
  Sparkles,
  Trash2,
  X,
  LayoutGrid,
  List,
  AlertTriangle,
  ClipboardCheck,
  UserX,
  Copy,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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

import { SPORTS, type AgeGroup } from "@/lib/types/enums";
import type { AssessmentSkill } from "@/lib/types/database";
import {
  createAssessmentTemplate,
  bulkDuplicateAssessmentTemplates,
  bulkDeleteAssessmentTemplates,
  type AssessmentTemplateListItem,
} from "@/lib/assessments/actions";

const AGE_GROUPS: AgeGroup[] = ["3-5", "5-8", "8-12"];

const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  "3-5": "3–5 yrs",
  "5-8": "5–8 yrs",
  "8-12": "8–12 yrs",
};

interface AssessmentListViewProps {
  templates: AssessmentTemplateListItem[];
  centres: { id: string; name: string }[];
  terms: { id: string; name: string }[];
  basePath: string;
}

// ============================================================
// Helpers
// ============================================================

function getMonday(): Date {
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

export function AssessmentListView({
  templates,
  centres,
  terms,
  basePath,
}: AssessmentListViewProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  // ============================================================
  // URL-backed filter state
  // ============================================================

  const [search, setSearchState] = useState(params.get("search") ?? "");
  const [sportFilter, setSportFilterState] = useState<string>(
    params.get("sport") ?? "all",
  );
  const [ageFilter, setAgeFilterState] = useState<string>(
    params.get("age") ?? "all",
  );
  const [termFilter, setTermFilterState] = useState<string>(
    params.get("term") ?? "all",
  );
  const [centreFilter, setCentreFilterState] = useState<string>(
    params.get("centre") ?? "all",
  );
  const [viewMode, setViewModeState] = useState<"grid" | "table">(
    params.get("view") === "grid" ? "grid" : "table",
  );

  // Pulse jump-link state
  const skillsEmpty = params.get("skills") === "empty";
  const pendingTerm = params.get("pending") === "term";
  const coachesSilent = params.get("coaches") === "silent";
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
  function setSportFilter(v: string) {
    setSportFilterState(v);
    replaceParam("sport", v === "all" ? null : v);
  }
  function setAgeFilter(v: string) {
    setAgeFilterState(v);
    replaceParam("age", v === "all" ? null : v);
  }
  function setTermFilter(v: string) {
    setTermFilterState(v);
    replaceParam("term", v === "all" ? null : v);
  }
  function setCentreFilter(v: string) {
    setCentreFilterState(v);
    replaceParam("centre", v === "all" ? null : v);
  }
  function setViewMode(v: "grid" | "table") {
    setViewModeState(v);
    replaceParam("view", v === "table" ? null : v);
  }
  function clearJump(key: "skills" | "pending" | "coaches" | "new") {
    replaceParam(key, null);
  }
  function clearAllFilters() {
    setSearchState("");
    setSportFilterState("all");
    setAgeFilterState("all");
    setTermFilterState("all");
    setCentreFilterState("all");
    router.replace("?", { scroll: false });
  }

  const anyFilterActive =
    search.trim().length > 0 ||
    sportFilter !== "all" ||
    ageFilter !== "all" ||
    termFilter !== "all" ||
    centreFilter !== "all" ||
    skillsEmpty ||
    pendingTerm ||
    coachesSilent ||
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
  // Dialog state
  // ============================================================

  const [dialogOpen, setDialogOpen] = useState(false);

  // ============================================================
  // Derived filtered list
  // ============================================================

  const filtered = useMemo(() => {
    let result = templates;
    const monday = getMonday();

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.sport.toLowerCase().includes(term) ||
          (t.centre_name ?? "").toLowerCase().includes(term) ||
          (t.term_name ?? "").toLowerCase().includes(term),
      );
    }

    if (sportFilter !== "all") {
      result = result.filter((t) => t.sport === sportFilter);
    }
    if (ageFilter !== "all") {
      result = result.filter((t) => t.age_group === ageFilter);
    }
    if (termFilter !== "all") {
      result = result.filter((t) =>
        termFilter === "none"
          ? t.term_id === null
          : t.term_id === termFilter,
      );
    }
    if (centreFilter !== "all") {
      result = result.filter((t) =>
        centreFilter === "none"
          ? t.centre_id === null
          : t.centre_id === centreFilter,
      );
    }

    // Pulse jump-link filters
    if (skillsEmpty) {
      result = result.filter((t) => t.skill_count === 0);
    }
    if (pendingTerm) {
      // Templates attached to a term with at least one expected rating
      // but zero ratings count are the most "actionable" subset.
      result = result.filter(
        (t) => t.term_id !== null && t.ratings_count === 0,
      );
    }
    if (coachesSilent) {
      // Same scope as above — these are the templates a coach would
      // need to fill out. Doesn't filter precisely by coach (that's
      // a roster question) but tightens the surface meaningfully.
      result = result.filter((t) => t.term_id !== null);
    }
    if (newThisWeek) {
      result = result.filter(
        (t) => new Date(t.created_at).getTime() >= monday.getTime(),
      );
    }

    return result;
  }, [
    templates,
    search,
    sportFilter,
    ageFilter,
    termFilter,
    centreFilter,
    skillsEmpty,
    pendingTerm,
    coachesSilent,
    newThisWeek,
  ]);

  const allVisibleIds = useMemo(() => filtered.map((t) => t.id), [filtered]);
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

  // Unique sports list driven by the actual data, not the static
  // SPORTS enum, so we don't show "Cricket" if nobody created one.
  const sportOptions = useMemo(() => {
    const s = new Set<string>();
    for (const t of templates) s.add(t.sport);
    return Array.from(s).sort();
  }, [templates]);

  return (
    <div className="space-y-6">
      {/* Active jump-filter chips */}
      {(skillsEmpty || pendingTerm || coachesSilent || newThisWeek) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {skillsEmpty && (
            <JumpChip
              icon={AlertTriangle}
              label="Without skills"
              onClear={() => clearJump("skills")}
            />
          )}
          {pendingTerm && (
            <JumpChip
              icon={ClipboardCheck}
              label="Pending this term"
              onClear={() => clearJump("pending")}
            />
          )}
          {coachesSilent && (
            <JumpChip
              icon={UserX}
              label="Coaches silent this week"
              onClear={() => clearJump("coaches")}
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
            placeholder="Search sport, centre, term..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-[40px] pl-9"
          />
        </div>

        <Select
          value={sportFilter}
          onValueChange={(v) => setSportFilter(v ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Sport" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sports</SelectItem>
            {sportOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={ageFilter}
          onValueChange={(v) => setAgeFilter(v ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-[120px]">
            <SelectValue placeholder="Age" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ages</SelectItem>
            {AGE_GROUPS.map((ag) => (
              <SelectItem key={ag} value={ag}>
                {AGE_GROUP_LABELS[ag]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={termFilter}
          onValueChange={(v) => setTermFilter(v ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Term" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All terms</SelectItem>
            <SelectItem value="none">No term</SelectItem>
            {terms.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={centreFilter}
          onValueChange={(v) => setCentreFilter(v ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Centre" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All centres</SelectItem>
            <SelectItem value="none">Org-wide</SelectItem>
            {centres.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
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

        <Button
          className="min-h-[40px] bg-primary text-white hover:bg-primary/90 sm:ml-auto"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="size-4" />
          Create assessment
        </Button>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border py-16 text-center">
          <ClipboardList className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            {templates.length === 0
              ? "No assessment templates yet. Create one to get started."
              : "No templates match your filters."}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => (
            <Link
              key={template.id}
              href={`${basePath}/${template.id}`}
              className={
                "group flex flex-col gap-3 rounded-2xl border bg-background p-4 transition hover:shadow-md hover:-translate-y-0.5 " +
                (template.skill_count === 0
                  ? "ring-1 ring-primary/30"
                  : "")
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium leading-tight">
                    {template.sport}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">
                      {AGE_GROUP_LABELS[template.age_group]}
                    </Badge>
                    {template.skill_count === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <AlertTriangle className="size-3" />
                        No skills
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="font-normal">
                  {template.skill_count} skill
                  {template.skill_count === 1 ? "" : "s"}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {template.term_name ? (
                  <Badge variant="outline" className="font-normal">
                    {template.term_name}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    All terms
                  </Badge>
                )}
                {template.centre_name ? (
                  <Badge variant="outline" className="font-normal">
                    {template.centre_name}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    Org-wide
                  </Badge>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {template.ratings_count} rating
                  {template.ratings_count === 1 ? "" : "s"}
                </span>
                <span>
                  {new Date(template.created_at).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <>
          {/* Desktop table — collapses to mobile cards below md */}
          <div className="hidden rounded-2xl border md:block">
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
                  <TableHead>Sport</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Skills</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Centre</TableHead>
                  <TableHead>Ratings</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((template) => {
                  const selected = selectedIds.has(template.id);
                  return (
                    <TableRow
                      key={template.id}
                      className={
                        "relative transition hover:bg-muted/30 " +
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
                          onCheckedChange={() => toggleSelect(template.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${template.sport}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{template.sport}</span>
                          {template.skill_count === 0 && (
                            <span
                              className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                              title="No skills defined"
                            >
                              <AlertTriangle className="size-2.5" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {AGE_GROUP_LABELS[template.age_group]}
                        </Badge>
                      </TableCell>
                      <TableCell>{template.skill_count}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {template.term_name ?? "All"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {template.centre_name ?? "Org-wide"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {template.ratings_count}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(template.created_at).toLocaleDateString(
                          "en-AU",
                          { day: "numeric", month: "short", year: "numeric" },
                        )}
                        {/* Inside the cell, not the row: an <a> is invalid
                            as a child of <tr> and the parser moves it,
                            breaking hydration (React #418). */}
                        <Link
                          href={`${basePath}/${template.id}`}
                          className="absolute inset-0"
                          aria-label={`View ${template.sport}`}
                          onClick={(e) => {
                            if (selectionActive) {
                              e.preventDefault();
                              toggleSelect(template.id);
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

          {/* Mobile — 1-column card list under md */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((template) => {
              const selected = selectedIds.has(template.id);
              return (
                <div
                  key={template.id}
                  className={
                    "relative flex flex-col gap-2 rounded-2xl border bg-background p-4 transition hover:shadow-md " +
                    (template.skill_count === 0
                      ? "ring-1 ring-primary/30 "
                      : "") +
                    (selected ? "bg-primary/5" : "")
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{template.sport}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="secondary">
                          {AGE_GROUP_LABELS[template.age_group]}
                        </Badge>
                        {template.skill_count === 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            <AlertTriangle className="size-2.5" />
                            No skills
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="font-normal">
                      {template.skill_count} skill
                      {template.skill_count === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="outline" className="font-normal">
                      {template.term_name ?? "All terms"}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {template.centre_name ?? "Org-wide"}
                    </Badge>
                    <span className="text-muted-foreground">
                      · {template.ratings_count} rating
                      {template.ratings_count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <Link
                    href={`${basePath}/${template.id}`}
                    className="absolute inset-0 rounded-2xl"
                    aria-label={`View ${template.sport}`}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {templates.length} template
        {templates.length === 1 ? "" : "s"}
      </p>

      {/* Sticky bulk-action bar (table view only) */}
      {viewMode === "table" && selectionActive && (
        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          onClear={clearSelection}
          onCompleted={() => {
            clearSelection();
            startTransition(() => router.refresh());
          }}
        />
      )}

      {/* Create dialog */}
      <CreateAssessmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        centres={centres}
        terms={terms}
        existingTemplates={templates}
        basePath={basePath}
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
  onClear,
  onCompleted,
}: {
  selectedIds: string[];
  onClear: () => void;
  onCompleted: () => void;
}) {
  const count = selectedIds.length;
  const [working, setWorking] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteWorking, setDeleteWorking] = useState(false);

  async function handleDuplicate() {
    setWorking(true);
    try {
      const { duplicated, errors, error } = await bulkDuplicateAssessmentTemplates(
        selectedIds,
      );
      if (error && duplicated === 0) {
        toast.error(error);
        return;
      }
      toast.success(
        `Duplicated ${duplicated} template${duplicated === 1 ? "" : "s"}` +
          (errors.length ? ` (${errors.length} skipped)` : "."),
      );
      onCompleted();
    } finally {
      setWorking(false);
    }
  }

  async function handleDelete() {
    setDeleteWorking(true);
    try {
      const { deleted, errors, error } = await bulkDeleteAssessmentTemplates(
        selectedIds,
      );
      if (error && deleted === 0) {
        toast.error(error);
        return;
      }
      if (deleted > 0) {
        toast.success(
          `Deleted ${deleted} template${deleted === 1 ? "" : "s"}` +
            (errors.length ? ` (${errors.length} kept — had ratings)` : "."),
        );
      } else {
        toast.info("No templates were deleted.");
      }
      setDeleteOpen(false);
      onCompleted();
    } finally {
      setDeleteWorking(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-background px-4 py-3 shadow-lg ring-1 ring-primary/20 sm:bottom-6 sm:right-6">
        <div className="flex items-center gap-3 pr-2 text-sm">
          <span className="font-medium text-foreground">
            {count} template{count === 1 ? "" : "s"} selected
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
          onClick={handleDuplicate}
          disabled={working}
        >
          {working ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Copy className="size-4" />
          )}
          Duplicate
        </Button>

        <Button
          size="sm"
          onClick={() => setDeleteOpen(true)}
          className="bg-primary text-white hover:bg-primary/90"
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count} template{count === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Templates with existing skill ratings will be kept. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteWorking}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleteWorking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteWorking ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================================
// Create Assessment Dialog
// ============================================================

function CreateAssessmentDialog({
  open,
  onOpenChange,
  centres,
  terms,
  existingTemplates,
  basePath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  centres: { id: string; name: string }[];
  terms: { id: string; name: string }[];
  existingTemplates: AssessmentTemplateListItem[];
  basePath: string;
}) {
  const router = useRouter();
  const [sport, setSport] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup | "">("");
  const [termId, setTermId] = useState("");
  const [centreId, setCentreId] = useState("");
  const [skills, setSkills] = useState<AssessmentSkill[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, startSaveTransition] = useTransition();

  // Inline duplicate warning — sport + age + term combination already
  // exists on a published template? Surface a link to the existing
  // one so the operator can choose to extend rather than re-create.
  const potentialDuplicate = useMemo(() => {
    if (!sport || !ageGroup) return null;
    return (
      existingTemplates.find(
        (t) =>
          t.sport === sport &&
          t.age_group === ageGroup &&
          (termId ? t.term_id === termId : t.term_id === null) &&
          t.skill_count > 0,
      ) ?? null
    );
  }, [sport, ageGroup, termId, existingTemplates]);

  function resetForm() {
    setSport("");
    setAgeGroup("");
    setTermId("");
    setCentreId("");
    setSkills([]);
    setIsGenerating(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  async function handleGenerate() {
    if (!sport || !ageGroup) {
      toast.error("Please select a sport and age group first.");
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/assessments/generate-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, ageGroup }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to generate skills.");
      }

      const data = await res.json();
      setSkills(data.data ?? []);
      toast.success("Skills generated successfully.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate skills.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function handleRemoveSkill(index: number) {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddSkill() {
    setSkills((prev) => [...prev, { name: "", description: "" }]);
  }

  function handleSkillChange(
    index: number,
    field: keyof AssessmentSkill,
    value: string,
  ) {
    setSkills((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  }

  function handleSave() {
    if (!sport || !ageGroup) {
      toast.error("Please select a sport and age group.");
      return;
    }

    const validSkills = skills.filter((s) => s.name.trim());
    if (validSkills.length === 0) {
      toast.error("Please add at least one skill.");
      return;
    }

    startSaveTransition(async () => {
      const { error } = await createAssessmentTemplate({
        sport,
        age_group: ageGroup as AgeGroup,
        skills_json: validSkills,
        term_id: termId || null,
        centre_id: centreId || null,
      });

      if (error) {
        toast.error(error);
        return;
      }

      toast.success("Assessment template created.");
      handleOpenChange(false);
      router.refresh();
    });
  }

  const canGenerate = sport && ageGroup;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Assessment Template</DialogTitle>
          <DialogDescription>
            Select a sport and age group, then generate or add skills to
            assess.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sport */}
          <div className="space-y-1.5">
            <Label>
              Sport <span className="text-destructive">*</span>
            </Label>
            <Select
              value={sport}
              onValueChange={(v) => setSport(v ?? "")}
            >
              <SelectTrigger className="w-full min-h-[44px]">
                <SelectValue placeholder="Select sport" />
              </SelectTrigger>
              <SelectContent>
                {SPORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Age */}
          <div className="space-y-1.5">
            <Label>
              Age Group <span className="text-destructive">*</span>
            </Label>
            <Select
              value={ageGroup}
              onValueChange={(v) => setAgeGroup((v ?? "") as AgeGroup | "")}
            >
              <SelectTrigger className="w-full min-h-[44px]">
                <SelectValue placeholder="Select age group" />
              </SelectTrigger>
              <SelectContent>
                {AGE_GROUPS.map((ag) => (
                  <SelectItem key={ag} value={ag}>
                    {AGE_GROUP_LABELS[ag]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Term */}
          <div className="space-y-1.5">
            <Label>
              Term{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Select
              value={termId}
              onValueChange={(v) => setTermId(v ?? "")}
            >
              <SelectTrigger className="w-full min-h-[44px]">
                <SelectValue placeholder="All terms" />
              </SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Centre */}
          <div className="space-y-1.5">
            <Label>
              Centre{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Select
              value={centreId}
              onValueChange={(v) => setCentreId(v ?? "")}
            >
              <SelectTrigger className="w-full min-h-[44px]">
                <SelectValue placeholder="All centres" />
              </SelectTrigger>
              <SelectContent>
                {centres.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {potentialDuplicate && (
            <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <p className="font-medium text-amber-900 dark:text-amber-100">
                A template for {sport} ·{" "}
                {AGE_GROUP_LABELS[ageGroup as AgeGroup]}
                {termId ? "" : " (no term)"} already exists.
              </p>
              <p className="mt-1 text-amber-800 dark:text-amber-200">
                It has {potentialDuplicate.skill_count} skill
                {potentialDuplicate.skill_count === 1 ? "" : "s"} and{" "}
                {potentialDuplicate.ratings_count} rating
                {potentialDuplicate.ratings_count === 1 ? "" : "s"}.{" "}
                <Link
                  href={`${basePath}/${potentialDuplicate.id}`}
                  className="inline-flex items-center gap-0.5 font-medium underline"
                >
                  Open existing
                  <ExternalLink className="size-3" />
                </Link>
              </p>
            </div>
          )}

          {/* Generate Skills */}
          <Button
            variant="secondary"
            className="w-full min-h-[44px]"
            disabled={!canGenerate || isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isGenerating ? "Generating skills..." : "Generate skills"}
          </Button>

          {/* Skills List */}
          {skills.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Skills ({skills.length})</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddSkill}
                  className="min-h-[44px] sm:min-h-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add skill
                </Button>
              </div>

              <div className="max-h-60 space-y-3 overflow-y-auto rounded-2xl border border-border p-3">
                {skills.map((skill, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2"
                  >
                    <div className="flex-1 space-y-1.5">
                      <Input
                        placeholder="Skill name"
                        value={skill.name}
                        onChange={(e) =>
                          handleSkillChange(index, "name", e.target.value)
                        }
                        className="text-sm min-h-[44px]"
                      />
                      <Input
                        placeholder="Description"
                        value={skill.description}
                        onChange={(e) =>
                          handleSkillChange(
                            index,
                            "description",
                            e.target.value,
                          )
                        }
                        className="text-sm min-h-[44px]"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-1 min-h-[44px] min-w-[44px] shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveSkill(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove skill</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => handleOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            className="min-h-[44px] bg-primary text-white hover:bg-primary/90"
            onClick={handleSave}
            disabled={isSaving || skills.length === 0}
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSaving ? "Saving..." : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
