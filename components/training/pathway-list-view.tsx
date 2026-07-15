"use client";

// ============================================================
// PathwayListView
// ============================================================
//
// Shared shell for the Pathways tab of /admin/training (and
// /ops/training). Mirrors the Modules tab design language minus
// bulk actions — pathways are referenced by assignments / pathway
// modules, so destructive bulk operations are not safe at this tier.
//
// Adds:
//   - URL-persisted search + status filter
//   - rounded-2xl cards, restrained orange on Create CTA / Required
//   - row-as-link overlay for keyboard / right-click / open-in-new-tab
//   - mobile 1-column card list under md

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CheckCircle, GitMerge, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteTrainingPathway } from "@/lib/training/actions";
import type { TrainingPathway } from "@/lib/types/database";
import type { TrainingCategory, TrainingStatus } from "@/lib/types/enums";

interface PathwayListViewProps {
  pathways: Array<TrainingPathway & { module_count: number }>;
}

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

// ============================================================
// Component
// ============================================================

export function PathwayListView({ pathways }: PathwayListViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const basePath = pathname.includes("/ops/") ? "/ops/training" : "/admin/training";

  // ============================================================
  // URL-backed filter state
  // ============================================================

  const [search, setSearchState] = useState(params.get("search") ?? "");
  const [statusFilter, setStatusFilterState] = useState<TrainingStatus | "all">(
    (params.get("status") as TrainingStatus | null) ?? "all",
  );

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
  function setStatusFilter(v: TrainingStatus | "all") {
    setStatusFilterState(v);
    replaceParam("status", v === "all" ? null : v);
  }
  function clearAllFilters() {
    setSearchState("");
    setStatusFilterState("all");
    const tab = params.get("tab");
    router.replace(tab ? `?tab=${tab}` : "?", { scroll: false });
  }

  const anyFilterActive =
    search.trim().length > 0 || statusFilter !== "all";

  const filtered = useMemo(() => {
    return pathways.filter((p) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack =
          p.title.toLowerCase() + " " + (p.description ?? "").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      return true;
    });
  }, [pathways, search, statusFilter]);

  // ============================================================
  // Empty (org has zero pathways)
  // ============================================================

  if (pathways.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border bg-background py-16 text-center">
        <GitMerge className="mb-3 size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">No pathways yet.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Chain modules into a guided learning sequence for new coaches.
        </p>
        <div className="mt-4">
          <Button
            render={<Link href={`${basePath}/pathways/new`} />}
            className="bg-primary text-white hover:bg-primary/90"
          >
            <Plus className="size-4" />
            Create Pathway
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
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
          value={statusFilter}
          onValueChange={(v) =>
            setStatusFilter((v ?? "all") as TrainingStatus | "all")
          }
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
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
            render={<Link href={`${basePath}/pathways/new`} />}
            className="min-h-[40px] bg-primary text-white hover:bg-primary/90"
          >
            <Plus className="size-4" />
            Create Pathway
          </Button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border bg-background py-16 text-center">
          <Search className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No pathways match your filters.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden rounded-2xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Modules</TableHead>
                  <TableHead className="text-center">Required</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((pathway) => {
                  const statusBadge = STATUS_BADGE[pathway.status];
                  return (
                    <TableRow
                      key={pathway.id}
                      className="relative transition hover:bg-muted/30"
                    >
                      <TableCell className="max-w-[320px]">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{pathway.title}</p>
                          {pathway.is_mandatory_onboarding && (
                            <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              Required
                            </span>
                          )}
                        </div>
                        {pathway.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {pathway.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {CATEGORY_LABEL[pathway.category]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {pathway.module_count}
                      </TableCell>
                      <TableCell className="text-center">
                        {pathway.is_mandatory_onboarding && (
                          <CheckCircle className="size-4 text-primary mx-auto" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusBadge.className}>
                          {statusBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(pathway.created_at)}
                        {/* Inside a cell, not the row: an <a> is invalid as
                            a child of <tr> and the parser moves it,
                            breaking hydration (React #418). It goes in
                            THIS cell rather than the delete cell below,
                            which is `relative` and would shrink the
                            overlay to that cell instead of the row. */}
                        <Link
                          href={`${basePath}/pathways/${pathway.id}`}
                          className="absolute inset-0"
                          aria-label={`View ${pathway.title}`}
                        />
                      </TableCell>
                      <TableCell
                        className="relative z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <PathwayDeleteDialog
                          pathwayId={pathway.id}
                          title={pathway.title}
                          onCompleted={() => router.refresh()}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards under md */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((pathway) => {
              const statusBadge = STATUS_BADGE[pathway.status];
              return (
                <div
                  key={pathway.id}
                  className={
                    "relative flex flex-col gap-2 rounded-2xl border bg-background p-4 transition hover:shadow-md " +
                    (pathway.is_mandatory_onboarding
                      ? "ring-1 ring-primary/30"
                      : "")
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">
                        {pathway.title}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="font-normal">
                          {CATEGORY_LABEL[pathway.category]}
                        </Badge>
                        <Badge className={statusBadge.className}>
                          {statusBadge.label}
                        </Badge>
                        {pathway.is_mandatory_onboarding && (
                          <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Required
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {pathway.module_count} module
                    {pathway.module_count === 1 ? "" : "s"} · Added{" "}
                    {formatDate(pathway.created_at)}
                  </p>
                  <Link
                    href={`${basePath}/pathways/${pathway.id}`}
                    className="absolute inset-0 rounded-2xl"
                    aria-label={`View ${pathway.title}`}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {pathways.length} pathway
        {pathways.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// ============================================================
// Per-row archive dialog (kept inline so the row-link overlay
// doesn't catch the click)
// ============================================================

function PathwayDeleteDialog({
  pathwayId,
  title,
  onCompleted,
}: {
  pathwayId: string;
  title: string;
  onCompleted: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <Trash2 className="h-4 w-4" />
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive Pathway</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to archive &quot;{title}&quot;? This will set
            the pathway status to archived. Existing assignments will be
            preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={async (e) => {
              e.stopPropagation();
              const result = await deleteTrainingPathway(pathwayId);
              if ("error" in result) {
                toast.error(result.error);
              } else {
                toast.success("Pathway archived.");
                onCompleted();
              }
            }}
          >
            Archive Pathway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
