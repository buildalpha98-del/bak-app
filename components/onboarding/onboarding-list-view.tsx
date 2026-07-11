"use client";

// ============================================================
// OnboardingListView
// ============================================================
//
// Shared list shell for /ops/onboarding (and any future /admin
// mirror). Drives:
//   - search + status + region filter chips (URL-persisted)
//   - grid + table view modes (toggled via ?view= URL param so the
//     choice survives refresh + sharing)
//
// Design language mirrors the centres / staff list refresh:
//   - rounded-2xl containers, gap-6 between sections, gap-4 within
//   - brand orange (#E8712A) reserved for the Start Onboarding CTA,
//     active-filter chip, progress bar fill, and "Behind" badge
//   - useCountUp on the headline counts so the page feels alive on
//     first paint
//
// The onboarding pulse strip + filter chips drop us straight into the
// row that needs action — e.g. behind-schedule = `?status=behind`.

import { useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  LayoutGrid,
  List as ListIcon,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Progress } from "@/components/ui/progress";

export interface OnboardingListItem {
  id: string;
  centreId: string;
  centreName: string;
  status: "in_progress" | "completed" | "stalled";
  startedAt: string;
  completedAt: string | null;
  completedSteps: number;
  totalSteps: number;
  daysSinceStart: number;
  nextStepLabel: string | null;
  /** ISO timestamp of when the next step is due / scheduled. */
  nextStepDueAt: string | null;
  regionId: string | null;
  regionName: string | null;
}

interface OnboardingListViewProps {
  items: OnboardingListItem[];
  regions: Array<{ id: string; name: string }>;
  basePath: string;
}

type StatusFilter = "all" | "in_progress" | "behind" | "complete";
type ViewMode = "grid" | "table";

// ============================================================
// Component
// ============================================================

export function OnboardingListView({
  items,
  regions,
  basePath,
}: OnboardingListViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-derived filter state. We avoid local React state for these
  // so links from the pulse strip (and shareable URLs) behave the
  // same as in-page clicks.
  const search = (searchParams.get("q") ?? "").trim();
  const statusFilter = (searchParams.get("status") ?? "all") as StatusFilter;
  const regionFilter = searchParams.get("region") ?? "all";
  const view = (searchParams.get("view") ?? "table") as ViewMode;
  const queuedOnly = searchParams.get("queued") === "yes";

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === "" || value === "all") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    },
    [basePath, router, searchParams],
  );

  // Filtering. All checks are client-side because the list is small
  // (a handful of in-flight onboardings — far below pagination
  // threshold). When the dataset grows we can push filters into the
  // server action.
  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    return items.filter((row) => {
      if (lower && !row.centreName.toLowerCase().includes(lower)) return false;
      if (regionFilter !== "all") {
        if (regionFilter === "none" && row.regionId) return false;
        if (regionFilter !== "none" && row.regionId !== regionFilter) return false;
      }
      if (statusFilter === "in_progress" && row.status !== "in_progress")
        return false;
      if (statusFilter === "complete" && row.status !== "completed") return false;
      if (statusFilter === "behind") {
        if (row.status !== "in_progress" || row.daysSinceStart <= 14)
          return false;
      }
      return true;
    });
  }, [items, search, statusFilter, regionFilter]);

  const activeFilterCount =
    (search ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (regionFilter !== "all" ? 1 : 0) +
    (queuedOnly ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Filter chip row */}
      <div className="rounded-2xl border bg-background p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setParam("q", e.target.value)}
              placeholder="Search centres…"
              className="pl-9 rounded-xl"
            />
          </div>

          <Select
            value={statusFilter}
            onValueChange={(v) => setParam("status", v === "all" ? null : v)}
          >
            <SelectTrigger className="w-44 rounded-xl">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="behind">Behind schedule</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={regionFilter}
            onValueChange={(v) => setParam("region", v === "all" ? null : v)}
          >
            <SelectTrigger className="w-44 rounded-xl">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              <SelectItem value="none">No region</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.replace(basePath, { scroll: false })}
              className="text-xs text-muted-foreground"
            >
              <X className="mr-1 size-3.5" /> Clear ({activeFilterCount})
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1 rounded-xl border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setParam("view", "table")}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                view === "table"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={view === "table"}
            >
              <ListIcon className="size-3.5" /> Table
            </button>
            <button
              type="button"
              onClick={() => setParam("view", "grid")}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                view === "grid"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={view === "grid"}
            >
              <LayoutGrid className="size-3.5" /> Grid
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState search={search} basePath={basePath} />
      ) : view === "grid" ? (
        <OnboardingGrid items={filtered} basePath={basePath} />
      ) : (
        <OnboardingTable items={filtered} basePath={basePath} />
      )}
    </div>
  );
}

// ============================================================
// Empty state
// ============================================================

function EmptyState({ search, basePath }: { search: string; basePath: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-background py-12 text-center">
      <ClipboardList className="mb-3 size-10 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">
        {search
          ? "No onboardings match your filters."
          : "No active onboardings yet."}
      </p>
      {search && (
        <Link
          href={basePath}
          className="mt-2 text-xs text-primary underline"
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}

// ============================================================
// Grid view
// ============================================================

function OnboardingGrid({
  items,
  basePath: _basePath,
}: {
  items: OnboardingListItem[];
  basePath: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((row) => (
        <OnboardingCard key={row.id} row={row} />
      ))}
    </div>
  );
}

function OnboardingCard({ row }: { row: OnboardingListItem }) {
  const pct =
    row.totalSteps > 0 ? (row.completedSteps / row.totalSteps) * 100 : 0;
  const isBehind = row.status === "in_progress" && row.daysSinceStart > 14;
  const isComplete = row.status === "completed";

  return (
    <Link
      href={`/admin/centres/${row.centreId}/onboarding`}
      className="group block rounded-2xl border bg-background p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {row.centreName}
          </p>
          {row.regionName && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {row.regionName}
            </p>
          )}
        </div>
        <StatusBadge status={row.status} behind={isBehind} />
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium tabular-nums text-foreground">
            {row.completedSteps}
            <span className="text-muted-foreground"> / {row.totalSteps}</span>
          </span>
          <span className="text-muted-foreground">
            {isComplete
              ? "completed"
              : `${row.daysSinceStart}d in flight`}
          </span>
        </div>
        <Progress
          value={pct}
          className="h-1.5 [&>div]:bg-primary"
        />
      </div>

      {!isComplete && row.nextStepLabel && (
        <div className="mt-3 rounded-xl bg-muted/40 px-3 py-2 text-xs">
          <p className="text-muted-foreground">Next step</p>
          <p className="mt-0.5 truncate font-medium text-foreground">
            {row.nextStepLabel}
          </p>
          {row.nextStepDueAt && (
            <p className="mt-0.5 text-muted-foreground">
              due {formatDueDate(row.nextStepDueAt)}
            </p>
          )}
        </div>
      )}
    </Link>
  );
}

// ============================================================
// Table view
// ============================================================

function OnboardingTable({
  items,
  basePath: _basePath,
}: {
  items: OnboardingListItem[];
  basePath: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Centre</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-44">Progress</TableHead>
            <TableHead>Next step</TableHead>
            <TableHead className="text-right">Days</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => {
            const pct =
              row.totalSteps > 0
                ? (row.completedSteps / row.totalSteps) * 100
                : 0;
            const isBehind =
              row.status === "in_progress" && row.daysSinceStart > 14;
            return (
              <TableRow
                key={row.id}
                className="cursor-pointer transition hover:bg-muted/40"
              >
                <TableCell>
                  <Link
                    href={`/admin/centres/${row.centreId}/onboarding`}
                    className="block"
                  >
                    <p className="font-medium text-foreground">
                      {row.centreName}
                    </p>
                    {row.regionName && (
                      <p className="text-xs text-muted-foreground">
                        {row.regionName}
                      </p>
                    )}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} behind={isBehind} />
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium tabular-nums text-foreground">
                        {row.completedSteps}
                        <span className="text-muted-foreground">
                          {" "}/ {row.totalSteps}
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        {Math.round(pct)}%
                      </span>
                    </div>
                    <Progress
                      value={pct}
                      className="h-1.5 [&>div]:bg-primary"
                    />
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {row.status === "completed" ? (
                    <span className="text-muted-foreground">—</span>
                  ) : row.nextStepLabel ? (
                    <div>
                      <p className="truncate text-foreground">
                        {row.nextStepLabel}
                      </p>
                      {row.nextStepDueAt && (
                        <p className="text-xs text-muted-foreground">
                          due {formatDueDate(row.nextStepDueAt)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {row.daysSinceStart}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ============================================================
// Status badge
// ============================================================

function StatusBadge({
  status,
  behind,
}: {
  status: OnboardingListItem["status"];
  behind: boolean;
}) {
  if (status === "completed") {
    return (
      <Badge
        variant="secondary"
        className="gap-1 rounded-full bg-emerald-100 text-emerald-700"
      >
        <CheckCircle2 className="size-3" /> Complete
      </Badge>
    );
  }
  if (behind) {
    return (
      <Badge
        variant="secondary"
        className="gap-1 rounded-full bg-primary/10 text-primary"
      >
        <AlertTriangle className="size-3" /> Behind
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="gap-1 rounded-full bg-muted text-muted-foreground"
    >
      <CircleDashed className="size-3" /> In progress
    </Badge>
  );
}

function formatDueDate(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      timeZone: "Australia/Sydney",
    }).format(d);
  } catch {
    return "—";
  }
}
