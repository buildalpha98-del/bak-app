"use client";

// ============================================================
// ProgramLibrary
// ============================================================
//
// Shared library shell for both /admin/programs and /ops/programs.
// Matches the design language from the prior close-outs
// (centres / staff / children / performance / assessments):
//   - filter chip row (search, sport, age multi-select, usage, sort)
//     with URL-state persistence so a filtered view is shareable +
//     refresh-safe
//   - jump-link chips from the status pulse
//     (?skills=empty, ?usage=unused, ?usage=stale, ?new=this_week)
//   - folder + grid + table view modes (URL-persisted)
//   - bulk-select on table view with sticky orange action bar
//     (Duplicate / Delete / Export CSV)
//   - row-as-link overlay for keyboard / right-click / open-in-new-tab
//
// Design language:
//   - rounded-2xl containers
//   - gap-6 between sections, gap-3 within
//   - brand orange (#E8712A) reserved for: dual CTA (Generate with AI +
//     Create blank), active view-toggle, bulk-action bar, active jump
//     chips, "No skills" ring, "Unused" badge.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  Check,
  CircleDashed,
  Clock,
  Copy,
  Download,
  FolderOpen,
  GitBranch,
  Hourglass,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  bulkDeleteProgrammes,
  bulkDuplicateProgrammes,
  exportProgrammesCsv,
} from "@/lib/programs/actions";
import type { ProgramListItem } from "@/lib/programs/actions";
import {
  AGE_BANDS,
  AGE_BAND_LABELS,
  formatProgramAgeBandsShort,
  formatProgramAgeBandsTooltip,
  getProgramAgeBands,
} from "@/lib/utils/programs/age-bands";

// ============================================================
// Local types + constants
// ============================================================

type SortOption = "newest" | "oldest" | "alpha" | "alpha-desc" | "used";
type ViewMode = "folder" | "grid" | "table";
type UsageFilter = "all" | "unused" | "stale" | "used";

const STALE_LAST_USED_DAYS = 90;
const STALE_AGE_DAYS = 60;

interface ProgramLibraryProps {
  programs: ProgramListItem[];
  basePath: string;
}

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function isStale(program: ProgramListItem): boolean {
  if (program.session_count === 0) return false;
  if (!program.last_used_at) return false;
  return (
    daysSince(program.created_at) >= STALE_AGE_DAYS &&
    daysSince(program.last_used_at) >= STALE_LAST_USED_DAYS
  );
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

export function ProgramLibrary({ programs, basePath }: ProgramLibraryProps) {
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
  // Age is multi-select; URL stores comma-separated bands.
  const ageParam = params.get("age") ?? "";
  const [ageFilters, setAgeFiltersState] = useState<string[]>(
    ageParam ? ageParam.split(",").filter(Boolean) : [],
  );
  const [usageFilter, setUsageFilterState] = useState<UsageFilter>(
    (params.get("usage") as UsageFilter | null) ?? "all",
  );
  const [sortBy, setSortByState] = useState<SortOption>(
    (params.get("sort") as SortOption | null) ?? "newest",
  );
  const [viewMode, setViewModeState] = useState<ViewMode>(
    (params.get("view") as ViewMode | null) ?? "folder",
  );

  // Pulse jump-link state
  const skillsEmpty = params.get("skills") === "empty";
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
  function setAgeFilters(values: string[]) {
    setAgeFiltersState(values);
    replaceParam("age", values.length > 0 ? values.join(",") : null);
  }
  function toggleAgeFilter(band: string) {
    setAgeFilters(
      ageFilters.includes(band)
        ? ageFilters.filter((b) => b !== band)
        : [...ageFilters, band],
    );
  }
  function setUsageFilter(v: UsageFilter) {
    setUsageFilterState(v);
    replaceParam("usage", v === "all" ? null : v);
  }
  function setSortBy(v: SortOption) {
    setSortByState(v);
    replaceParam("sort", v === "newest" ? null : v);
  }
  function setViewMode(v: ViewMode) {
    setViewModeState(v);
    replaceParam("view", v === "folder" ? null : v);
  }
  function clearJump(key: "skills" | "new") {
    replaceParam(key, null);
  }
  function clearAllFilters() {
    setSearchState("");
    setSportFilterState("all");
    setAgeFiltersState([]);
    setUsageFilterState("all");
    setSortByState("newest");
    router.replace("?", { scroll: false });
  }

  const anyFilterActive =
    search.trim().length > 0 ||
    sportFilter !== "all" ||
    ageFilters.length > 0 ||
    usageFilter !== "all" ||
    skillsEmpty ||
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

  const availableSports = useMemo(() => {
    const sports = new Set(programs.map((p) => p.sport));
    return Array.from(sports).sort();
  }, [programs]);

  const filtered = useMemo(() => {
    let result = [...programs];
    const monday = getMondayDate();

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.sport.toLowerCase().includes(q) ||
          (p.skill_focus?.toLowerCase().includes(q) ?? false) ||
          (p.created_by_name?.toLowerCase().includes(q) ?? false),
      );
    }

    if (sportFilter !== "all") {
      result = result.filter((p) => p.sport === sportFilter);
    }

    if (ageFilters.length > 0) {
      result = result.filter((p) => {
        const bands = getProgramAgeBands(p);
        return ageFilters.some((band) => bands.includes(band));
      });
    }

    if (usageFilter === "unused") {
      result = result.filter((p) => p.session_count === 0);
    } else if (usageFilter === "stale") {
      result = result.filter(isStale);
    } else if (usageFilter === "used") {
      result = result.filter((p) => p.session_count > 0);
    }

    if (skillsEmpty) {
      result = result.filter((p) => !p.has_skills);
    }
    if (newThisWeek) {
      result = result.filter(
        (p) => new Date(p.created_at).getTime() >= monday.getTime(),
      );
    }

    switch (sortBy) {
      case "newest":
        result.sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        );
        break;
      case "oldest":
        result.sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime(),
        );
        break;
      case "alpha":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "alpha-desc":
        result.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case "used":
        result.sort((a, b) => b.session_count - a.session_count);
        break;
    }

    return result;
  }, [
    programs,
    search,
    sportFilter,
    ageFilters,
    usageFilter,
    skillsEmpty,
    newThisWeek,
    sortBy,
  ]);

  // Group filtered programs by sport for folder view.
  const groupedBySport = useMemo(() => {
    const groups: Record<string, ProgramListItem[]> = {};
    for (const program of filtered) {
      const sport = program.sport || "Other";
      if (!groups[sport]) groups[sport] = [];
      groups[sport].push(program);
    }
    const sorted = Object.keys(groups).sort();
    return sorted.map((sport) => ({ sport, programs: groups[sport] }));
  }, [filtered]);

  const allVisibleIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
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

  // Drop selection when flipping away from the table view (no bulk
  // bar visible elsewhere).
  useEffect(() => {
    if (viewMode !== "table" && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [viewMode, selectedIds.size]);

  const selectionActive = selectedIds.size > 0;

  // Folder open-state (collapsed by default — the URL persistence
  // is only for filter/view modes, folder state is ephemeral).
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  function toggleFolder(sport: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport);
      else next.add(sport);
      return next;
    });
  }

  // Empty (org has zero programmes) — distinct from "no results
  // under current filters" because the CTAs are different.
  if (programs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border bg-background py-16 text-center">
        <BookOpen className="mb-3 size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">
          No programmes yet.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Generate one with AI or create a blank to get started.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button
            render={<Link href={`${basePath}/generate`} />}
            className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
          >
            <Sparkles className="size-4" />
            Generate with AI
          </Button>
          <Button
            variant="outline"
            render={<Link href={`${basePath}/generate?blank=1`} />}
          >
            <Plus className="size-4" />
            Create blank
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active jump-filter chips */}
      {(skillsEmpty || newThisWeek) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {skillsEmpty && (
            <JumpChip
              icon={AlertTriangle}
              label="Missing skills"
              onClear={() => clearJump("skills")}
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
            placeholder="Search title, sport, focus, creator..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-[40px] pl-9"
          />
        </div>

        <Select
          value={sportFilter}
          onValueChange={(v) => setSportFilter(v ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All sports" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sports</SelectItem>
            {availableSports.map((sport) => (
              <SelectItem key={sport} value={sport}>
                {sport}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Age multi-select via Popover */}
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className="w-full justify-between sm:w-[140px]"
              >
                <span className="truncate">
                  {ageFilters.length === 0
                    ? "All ages"
                    : ageFilters.length === 1
                      ? `Ages ${ageFilters[0]}`
                      : `${ageFilters.length} ages`}
                </span>
              </Button>
            }
          />
          <PopoverContent className="w-[180px] p-2" align="start">
            <p className="px-2 pb-1 text-xs text-muted-foreground">
              Age groups
            </p>
            <div className="space-y-1">
              {AGE_BANDS.map((band) => {
                const checked = ageFilters.includes(band);
                return (
                  <label
                    key={band}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleAgeFilter(band)}
                      aria-label={AGE_BAND_LABELS[band]}
                    />
                    <span>{AGE_BAND_LABELS[band]}</span>
                  </label>
                );
              })}
            </div>
            {ageFilters.length > 0 && (
              <button
                type="button"
                onClick={() => setAgeFilters([])}
                className="mt-2 w-full rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40"
              >
                Clear ages
              </button>
            )}
          </PopoverContent>
        </Popover>

        <Select
          value={usageFilter}
          onValueChange={(v) => setUsageFilter((v ?? "all") as UsageFilter)}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Usage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All usage</SelectItem>
            <SelectItem value="used">Used</SelectItem>
            <SelectItem value="unused">Unused</SelectItem>
            <SelectItem value="stale">Stale</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy((v ?? "newest") as SortOption)}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="alpha">A → Z</SelectItem>
            <SelectItem value="alpha-desc">Z → A</SelectItem>
            <SelectItem value="used">Most used</SelectItem>
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div className="flex rounded-lg border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewMode("folder")}
            aria-label="Folder view"
            className={
              viewMode === "folder"
                ? "rounded-r-none bg-[#E8712A]/10 text-[#E8712A] hover:bg-[#E8712A]/15"
                : "rounded-r-none"
            }
          >
            <FolderOpen className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
            className={
              viewMode === "grid"
                ? "rounded-none bg-[#E8712A]/10 text-[#E8712A] hover:bg-[#E8712A]/15"
                : "rounded-none"
            }
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewMode("table")}
            aria-label="Table view"
            className={
              viewMode === "table"
                ? "rounded-l-none bg-[#E8712A]/10 text-[#E8712A] hover:bg-[#E8712A]/15"
                : "rounded-l-none"
            }
          >
            <List className="size-4" />
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

        {/* Dual CTA — AI is the marquee action so it gets the orange. */}
        <div className="flex items-center gap-2 sm:ml-auto">
          <Button
            variant="outline"
            render={<Link href={`${basePath}/generate?blank=1`} />}
            className="min-h-[40px]"
          >
            <Plus className="size-4" />
            Create blank
          </Button>
          <Button
            render={<Link href={`${basePath}/generate`} />}
            className="min-h-[40px] bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
          >
            <Sparkles className="size-4" />
            Generate with AI
          </Button>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border bg-background py-16 text-center">
          <Search className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No programmes match your filters.
          </p>
        </div>
      ) : viewMode === "folder" ? (
        <FolderView
          groups={groupedBySport}
          openFolders={openFolders}
          onToggleFolder={toggleFolder}
          basePath={basePath}
        />
      ) : viewMode === "grid" ? (
        <GridView programs={filtered} basePath={basePath} />
      ) : (
        <TableView
          programs={filtered}
          basePath={basePath}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          allVisibleSelected={allVisibleSelected}
          selectionActive={selectionActive}
        />
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {programs.length} programme
        {programs.length === 1 ? "" : "s"}
      </p>

      {/* Sticky bulk-action bar — only in table view, on selection */}
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
// Folder view — grouped by sport with collapsible folders
// ============================================================

function FolderView({
  groups,
  openFolders,
  onToggleFolder,
  basePath,
}: {
  groups: { sport: string; programs: ProgramListItem[] }[];
  openFolders: Set<string>;
  onToggleFolder: (sport: string) => void;
  basePath: string;
}) {
  return (
    <div className="space-y-3">
      {groups.map(({ sport, programs: sportPrograms }) => {
        const isOpen = openFolders.has(sport);
        return (
          <div
            key={sport}
            className="rounded-2xl border bg-background transition hover:shadow-sm"
          >
            <button
              type="button"
              onClick={() => onToggleFolder(sport)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E8712A]/10">
                <FolderOpen className="h-4 w-4 text-[#E8712A]" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">
                  {sport}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {sportPrograms.length} programme
                  {sportPrograms.length !== 1 ? "s" : ""}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {isOpen ? "Hide" : "Show"}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-border p-3 pt-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sportPrograms.map((p) => (
                    <ProgramTile key={p.id} program={p} basePath={basePath} />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Grid view — flat 3-column tile grid (1-col under md)
// ============================================================

function GridView({
  programs,
  basePath,
}: {
  programs: ProgramListItem[];
  basePath: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {programs.map((p) => (
        <ProgramTile key={p.id} program={p} basePath={basePath} />
      ))}
    </div>
  );
}

// ============================================================
// Program tile — shared between folder & grid views
// ============================================================

function ProgramTile({
  program,
  basePath,
}: {
  program: ProgramListItem;
  basePath: string;
}) {
  const ageBandsShort = formatProgramAgeBandsShort(program);
  const ageBandsTooltip = formatProgramAgeBandsTooltip(program) ?? ageBandsShort;
  const stale = isStale(program);
  const unused = program.session_count === 0;
  const noSkills = !program.has_skills;

  return (
    <Link
      href={`${basePath}/${program.id}`}
      className={
        "group relative flex flex-col gap-2 rounded-2xl border bg-background p-4 transition hover:-translate-y-0.5 hover:shadow-md " +
        (noSkills ? "ring-1 ring-[#E8712A]/30" : "")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-tight text-foreground">
            {program.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-xs font-normal">
              {program.sport}
            </Badge>
            {ageBandsShort && (
              <Badge
                variant="secondary"
                className="text-xs font-normal"
                title={ageBandsTooltip ?? ageBandsShort}
              >
                Ages {ageBandsShort}
              </Badge>
            )}
            {program.version_number > 1 && (
              <Badge variant="outline" className="gap-0.5 text-[10px]">
                <GitBranch className="size-2.5" />v{program.version_number}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Status row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {noSkills && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2 py-0.5 text-[10px] font-medium text-[#E8712A]">
            <AlertTriangle className="size-2.5" />
            No skills
          </span>
        )}
        {unused && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2 py-0.5 text-[10px] font-medium text-[#E8712A]">
            <CircleDashed className="size-2.5" />
            Unused
          </span>
        )}
        {stale && (
          <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/30 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Hourglass className="size-2.5" />
            Stale
          </span>
        )}
      </div>

      {program.skill_focus && (
        <p className="line-clamp-1 text-xs text-muted-foreground">
          Focus: {program.skill_focus}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" />
          {program.duration_minutes} min
        </span>
        {program.session_count > 0 ? (
          <span
            className="inline-flex items-center gap-1"
            title={
              program.last_used_at
                ? `Last used ${formatDate(program.last_used_at)}`
                : undefined
            }
          >
            <Check className="size-3" />
            {program.session_count} session
            {program.session_count === 1 ? "" : "s"}
          </span>
        ) : null}
        {program.last_used_at && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" />
            Last used {formatDate(program.last_used_at)}
          </span>
        )}
        {!program.last_used_at && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" />
            Added {formatDate(program.created_at)}
          </span>
        )}
        {program.created_by_name && (
          <span className="inline-flex items-center gap-1">
            <User className="size-3" />
            {program.created_by_name}
          </span>
        )}
      </div>
    </Link>
  );
}

// ============================================================
// Table view — bulk-select + row overlay anchor
// ============================================================

function TableView({
  programs,
  basePath,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allVisibleSelected,
  selectionActive,
}: {
  programs: ProgramListItem[];
  basePath: string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  allVisibleSelected: boolean;
  selectionActive: boolean;
}) {
  return (
    <>
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
              <TableHead>Sport</TableHead>
              <TableHead>Ages</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Sessions</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {programs.map((p) => {
              const selected = selectedIds.has(p.id);
              const noSkills = !p.has_skills;
              const ageBandsShort = formatProgramAgeBandsShort(p);
              return (
                <TableRow
                  key={p.id}
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
                      onCheckedChange={() => onToggleSelect(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${p.title}`}
                    />
                  </TableCell>
                  <TableCell className="max-w-[280px] font-medium">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{p.title}</span>
                      {noSkills && (
                        <span
                          className="inline-flex items-center rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#E8712A]"
                          title="No skills defined"
                        >
                          <AlertTriangle className="size-2.5" />
                        </span>
                      )}
                      {p.version_number > 1 && (
                        <Badge variant="outline" className="text-[10px]">
                          <GitBranch className="size-2.5" />v{p.version_number}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {p.sport}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ageBandsShort ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.duration_minutes}m
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.session_count > 0 ? (
                      p.session_count
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#E8712A]">
                        <CircleDashed className="size-2.5" />
                        Unused
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.last_used_at ? formatDate(p.last_used_at) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(p.created_at)}
                  </TableCell>
                  <Link
                    href={`${basePath}/${p.id}`}
                    className="absolute inset-0"
                    aria-label={`View ${p.title}`}
                    onClick={(e) => {
                      if (selectionActive) {
                        e.preventDefault();
                        onToggleSelect(p.id);
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
        {programs.map((p) => {
          const selected = selectedIds.has(p.id);
          const noSkills = !p.has_skills;
          const unused = p.session_count === 0;
          const ageBandsShort = formatProgramAgeBandsShort(p);
          return (
            <div
              key={p.id}
              className={
                "relative flex flex-col gap-2 rounded-2xl border bg-background p-4 transition hover:shadow-md " +
                (noSkills ? "ring-1 ring-[#E8712A]/30 " : "") +
                (selected ? "bg-[#E8712A]/5" : "")
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium leading-tight">{p.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs font-normal">
                      {p.sport}
                    </Badge>
                    {ageBandsShort && (
                      <Badge variant="secondary" className="text-xs font-normal">
                        Ages {ageBandsShort}
                      </Badge>
                    )}
                    {noSkills && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2 py-0.5 text-[10px] font-medium text-[#E8712A]">
                        <AlertTriangle className="size-2.5" />
                        No skills
                      </span>
                    )}
                    {unused && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2 py-0.5 text-[10px] font-medium text-[#E8712A]">
                        <CircleDashed className="size-2.5" />
                        Unused
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{p.duration_minutes} min</span>
                <span>
                  {p.session_count} session{p.session_count === 1 ? "" : "s"}
                </span>
                <span>
                  {p.last_used_at
                    ? `Last used ${formatDate(p.last_used_at)}`
                    : `Added ${formatDate(p.created_at)}`}
                </span>
              </div>
              <Link
                href={`${basePath}/${p.id}`}
                className="absolute inset-0 rounded-2xl"
                aria-label={`View ${p.title}`}
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
  const [duplicating, setDuplicating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const { duplicated, errors, error } = await bulkDuplicateProgrammes(
        selectedIds,
      );
      if (error && duplicated === 0) {
        toast.error(error);
        return;
      }
      toast.success(
        `Duplicated ${duplicated} programme${duplicated === 1 ? "" : "s"}` +
          (errors.length ? ` (${errors.length} skipped).` : "."),
      );
      onCompleted();
    } finally {
      setDuplicating(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { csv, error } = await exportProgrammesCsv(selectedIds);
      if (error || !csv) {
        toast.error(error ?? "Export failed.");
        return;
      }
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `programmes-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${selectedIds.length} programme${selectedIds.length === 1 ? "" : "s"}.`,
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const { deleted, errors, error } = await bulkDeleteProgrammes(
        selectedIds,
      );
      if (error && deleted === 0) {
        toast.error(error);
        return;
      }
      if (deleted > 0) {
        toast.success(
          `Deleted ${deleted} programme${deleted === 1 ? "" : "s"}` +
            (errors.length ? ` (${errors.length} kept — in use).` : "."),
        );
      } else {
        toast.info("No programmes were deleted.");
      }
      setDeleteOpen(false);
      onCompleted();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-[#E8712A]/40 bg-background px-4 py-3 shadow-lg ring-1 ring-[#E8712A]/20 sm:bottom-6 sm:right-6">
        <div className="flex items-center gap-3 pr-2 text-sm">
          <span className="font-medium text-foreground">
            {count} programme{count === 1 ? "" : "s"} selected
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
          disabled={duplicating}
        >
          {duplicating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Copy className="size-4" />
          )}
          Duplicate
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
          onClick={() => setDeleteOpen(true)}
          className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count} programme{count === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Programmes still assigned to sessions will be kept. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
