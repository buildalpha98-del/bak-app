"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  Calendar,
  Clock,
  ChevronDown,
  ChevronRight,
  Search,
  SlidersHorizontal,
  User,
  GitBranch,
  LayoutGrid,
  FolderOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProgramView } from "./program-view";
import { getProgramById } from "@/lib/programs/actions";
import type { ProgramListItem } from "@/lib/programs/actions";
import type { ProgramContentJson } from "@/lib/ai/types";
import { SPORTS } from "@/lib/types/enums";
import {
  formatProgramAgeBandsShort,
  formatProgramAgeBandsTooltip,
  getProgramAgeBands,
} from "@/lib/utils/programs/age-bands";

// ============================================================
// Programme Library — searchable, filterable grid
// ============================================================

interface ProgramLibraryProps {
  programs: ProgramListItem[];
  basePath: string;
}

const AGE_GROUPS = ["3-5", "5-8", "8-12"] as const;

type SortOption = "newest" | "oldest" | "alpha" | "alpha-desc";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type ViewMode = "folder" | "grid";

export function ProgramLibrary({ programs, basePath }: ProgramLibraryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [ageFilter, setAgeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("folder");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  // Derive unique sports and creators from the data
  const availableSports = useMemo(() => {
    const sports = new Set(programs.map((p) => p.sport));
    return Array.from(sports).sort();
  }, [programs]);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = [...programs];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.sport.toLowerCase().includes(q) ||
          (p.skill_focus?.toLowerCase().includes(q) ?? false) ||
          (p.created_by_name?.toLowerCase().includes(q) ?? false)
      );
    }

    // Sport filter
    if (sportFilter !== "all") {
      result = result.filter((p) => p.sport === sportFilter);
    }

    // Age filter — match against the full age_groups list so multi-age
    // programmes (P2+) appear under each of their bands.
    if (ageFilter !== "all") {
      result = result.filter((p) => getProgramAgeBands(p).includes(ageFilter));
    }

    // Sort
    switch (sortBy) {
      case "newest":
        result.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      case "oldest":
        result.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        break;
      case "alpha":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "alpha-desc":
        result.sort((a, b) => b.title.localeCompare(a.title));
        break;
    }

    return result;
  }, [programs, search, sportFilter, ageFilter, sortBy]);

  // Group filtered programs by sport for folder view
  const groupedBySport = useMemo(() => {
    const groups: Record<string, ProgramListItem[]> = {};
    for (const program of filtered) {
      const sport = program.sport || "Other";
      if (!groups[sport]) groups[sport] = [];
      groups[sport].push(program);
    }
    // Sort sport keys alphabetically
    const sorted = Object.keys(groups).sort();
    return sorted.map((sport) => ({ sport, programs: groups[sport] }));
  }, [filtered]);

  function toggleFolder(sport: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(sport)) {
        next.delete(sport);
      } else {
        next.add(sport);
      }
      return next;
    });
  }

  if (programs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">
            No programmes yet. Generate your first programme to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search programmes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-md border border-border">
            <Button
              variant={viewMode === "folder" ? "default" : "ghost"}
              size="sm"
              className="rounded-r-none h-8 px-2.5"
              onClick={() => setViewMode("folder")}
              title="Folder View"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              className="rounded-l-none h-8 px-2.5"
              onClick={() => setViewMode("grid")}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? "border-primary text-primary" : ""}
          >
            <SlidersHorizontal className="mr-1.5 h-4 w-4" />
            Filters
          </Button>
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortOption)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="alpha">A → Z</SelectItem>
              <SelectItem value="alpha-desc">Z → A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filter dropdowns */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-secondary p-3">
          <Select value={sportFilter} onValueChange={(v) => setSportFilter(v ?? "")}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Sports" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sports</SelectItem>
              {availableSports.map((sport) => (
                <SelectItem key={sport} value={sport}>
                  {sport}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={ageFilter} onValueChange={(v) => setAgeFilter(v ?? "")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Ages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Ages</SelectItem>
              {AGE_GROUPS.map((ag) => (
                <SelectItem key={ag} value={ag}>
                  Ages {ag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(sportFilter !== "all" || ageFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSportFilter("all");
                setAgeFilter("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Results count */}
      <p className="text-xs text-muted-foreground/60">
        {filtered.length} programme{filtered.length !== 1 ? "s" : ""}
        {search || sportFilter !== "all" || ageFilter !== "all"
          ? ` matching filters`
          : ""}
      </p>

      {/* Programme cards */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Search className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              No programmes match your search or filters.
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "folder" ? (
        /* ── Folder View ── */
        <div className="space-y-3">
          {groupedBySport.map(({ sport, programs: sportPrograms }) => {
            const isOpen = openFolders.has(sport);
            return (
              <Card key={sport} className="card-hover">
                <button
                  type="button"
                  onClick={() => toggleFolder(sport)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-orange-light)]">
                    <FolderOpen className="h-4 w-4 text-primary" />
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
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {isOpen && (
                  <div className="border-t border-border px-4 pb-3">
                    <div className="space-y-2 pt-3">
                      {sportPrograms.map((program) => (
                        <ProgramCard
                          key={program.id}
                          program={program}
                          basePath={basePath}
                          expandedId={expandedId}
                          onToggleExpand={(id) =>
                            setExpandedId(expandedId === id ? null : id)
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        /* ── Grid View (original flat list) ── */
        <div className="space-y-3">
          {filtered.map((program) => (
            <ProgramCard
              key={program.id}
              program={program}
              basePath={basePath}
              expandedId={expandedId}
              onToggleExpand={(id) =>
                setExpandedId(expandedId === id ? null : id)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Programme Card — shared between grid and folder views
// ============================================================

function ProgramCard({
  program,
  basePath,
  expandedId,
  onToggleExpand,
}: {
  program: ProgramListItem;
  basePath: string;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  const isExpanded = expandedId === program.id;

  return (
    <Card className="card-hover">
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => onToggleExpand(program.id)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-orange-light)]"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-primary" />
            ) : (
              <ChevronRight className="h-4 w-4 text-primary" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`${basePath}/${program.id}`}
                className="text-sm font-medium text-foreground truncate hover:text-primary transition-colors"
              >
                {program.title}
              </Link>
              {program.version_number > 1 && (
                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px] gap-0.5"
                >
                  <GitBranch className="h-2.5 w-2.5" />v
                  {program.version_number}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {program.sport}
              </Badge>
              {(() => {
                const short = formatProgramAgeBandsShort(program);
                if (!short) return null;
                const tooltip = formatProgramAgeBandsTooltip(program) ?? short;
                return (
                  <Badge
                    variant="secondary"
                    className="text-xs"
                    title={tooltip}
                  >
                    Ages {short}
                  </Badge>
                );
              })()}
              <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                <Clock className="h-3 w-3" />
                {program.duration_minutes} min
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                <Calendar className="h-3 w-3" />
                {formatDate(program.created_at)}
              </span>
              {program.created_by_name && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                  <User className="h-3 w-3" />
                  {program.created_by_name}
                </span>
              )}
            </div>
            {program.skill_focus && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Focus: {program.skill_focus}
              </p>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 border-t border-border pt-4">
            <ExpandedProgram programId={program.id} basePath={basePath} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Expanded programme detail (lazy-loads content_json)
// ============================================================

function ExpandedProgram({
  programId,
  basePath,
}: {
  programId: string;
  basePath: string;
}) {
  const [content, setContent] = useState<ProgramContentJson | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getProgramById(programId).then(({ data }) => {
      if (data) {
        setContent(data.content_json as unknown as ProgramContentJson);
      }
      setLoading(false);
    });
  }, [programId]);

  if (loading) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted-foreground">Loading programme…</p>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Unable to load programme details.
        </p>
      </div>
    );
  }

  return (
    <div>
      <ProgramView content={content} collapsible />
      <div className="mt-4 flex justify-end">
        <Link href={`${basePath}/${programId}`}>
          <Button variant="outline" size="sm">
            View Full Details
          </Button>
        </Link>
      </div>
    </div>
  );
}
