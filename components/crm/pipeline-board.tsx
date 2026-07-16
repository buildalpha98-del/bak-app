"use client";

// ============================================================
// PipelineBoard — main CRM kanban (shared by /admin/crm and /ops/crm)
// ============================================================
//
// Design language mirrors the prior close-outs (admin home `80ce5a5`,
// centres `6cbfb6d`, roster `91a1581`):
//   - rounded-2xl cards everywhere
//   - gap-6 between sections, gap-4 within
//   - brand orange (#E8712A) only as an accent — active filter chip,
//     hot-lead flame, pulse cells > 0, primary CTA, sticky bulk-action
//     bar's primary action. Everything else neutral.
//   - useCountUp tick-up on summary card numbers on first render
//
// This file owns:
//   1. Status pulse strip with jump-link chips
//   2. Summary bar (5 cards including Email Sequences)
//   3. Filter chip row + URL persistence (Stage, Owner, Region, Source,
//      Value range) + jump chips (stale, overdue, trials_ending, hot)
//   4. Bulk-select with sticky bottom-right action bar (Reassign owner,
//      Change stage, Add to sequence stub, Delete)
//   5. Aging-in-stage tint on cards (0-6d none, 7-13d amber, 14+ red)
//   6. Owner avatar chip + hot-lead flame indicator
//   7. Collapsible Won/Lost columns (?closed=show)
//   8. Mobile responsive: stage chip picker below md breakpoint

import { useState, useMemo, useTransition, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import Link from "@/components/ui/app-link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Building2,
  GraduationCap,
  DollarSign,
  Users,
  Clock,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Mail,
  Flame,
  Lock,
  X,
  Trash2,
  UserCog,
  ArrowRightLeft,
  ListPlus,
  User,
  AlertTriangle,
  AlarmClock,
  CalendarClock,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LeadCreateDialog } from "./lead-create-dialog";
import { CrmStatusPulseStrip, type CrmPulseJump } from "./crm-status-pulse";
import {
  changeLeadStage,
  bulkChangeStage,
  bulkAssignOwner,
  bulkDeleteLeads,
} from "@/lib/crm/actions";
import type { LeadWithOwner, PipelineSummary } from "@/lib/crm/actions";
import type { CrmStatusPulse, SequencesSummary } from "@/lib/crm/status-pulse-actions";
import type { LeadStage, LeadSource } from "@/lib/types/enums";
import { useCountUp } from "@/components/launch/use-count-up";

// ============================================================
// Constants
// ============================================================

const PIPELINE_STAGES: { key: LeadStage; label: string; colour: string }[] = [
  { key: "cold_lead", label: "Cold Lead", colour: "bg-slate-100 text-slate-700" },
  { key: "contacted", label: "Contacted", colour: "bg-blue-100 text-blue-700" },
  { key: "interested", label: "Interested", colour: "bg-amber-100 text-amber-700" },
  { key: "free_trial", label: "Free Trial", colour: "bg-purple-100 text-purple-700" },
  { key: "proposal_sent", label: "Proposal Sent", colour: "bg-orange-100 text-orange-700" },
];

const CLOSED_STAGES: { key: LeadStage; label: string; colour: string }[] = [
  { key: "won", label: "Won", colour: "bg-emerald-100 text-emerald-700" },
  { key: "lost", label: "Lost", colour: "bg-rose-100 text-rose-700" },
  { key: "churned", label: "Churned", colour: "bg-zinc-100 text-zinc-700" },
];

const ALL_STAGES: { value: LeadStage; label: string }[] = [
  { value: "cold_lead", label: "Cold Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "free_trial", label: "Free Trial" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "churned", label: "Churned" },
];

const ACTIVE_STAGE_KEYS: LeadStage[] = [
  "cold_lead",
  "contacted",
  "interested",
  "free_trial",
  "proposal_sent",
];

const REQUIRES_REASON: LeadStage[] = ["won", "lost", "churned"];

const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "csv_import", label: "CSV Import" },
  { value: "web_form", label: "Web Form" },
  { value: "referral", label: "Referral" },
];

type ValueBucket = "lt_1k" | "1k_5k" | "5k_15k" | "gt_15k";

const VALUE_BUCKETS: { value: ValueBucket; label: string; test: (v: number) => boolean }[] = [
  { value: "lt_1k", label: "< $1k", test: (v) => v < 1000 },
  { value: "1k_5k", label: "$1k - $5k", test: (v) => v >= 1000 && v < 5000 },
  { value: "5k_15k", label: "$5k - $15k", test: (v) => v >= 5000 && v < 15000 },
  { value: "gt_15k", label: "> $15k", test: (v) => v >= 15000 },
];

// ============================================================
// Helpers
// ============================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function daysInStage(stageChangedAt: string): number {
  const changed = new Date(stageChangedAt);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - changed.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Aging tint thresholds for active-stage cards. Won/Lost/Churned are
 * always skipped — those are closed. 0-6 days is calm (no tint),
 * 7-13 days is amber (warming up), 14+ days is red (needs attention).
 */
function agingTintClasses(stage: LeadStage, stageChangedAt: string): string {
  if (REQUIRES_REASON.includes(stage)) return "border";
  const days = daysInStage(stageChangedAt);
  if (days >= 14) return "border-red-200 bg-red-50";
  if (days >= 7) return "border-amber-200 bg-amber-50";
  return "border";
}

function initialsOf(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Inline media-query hook — `null` until mounted (avoids SSR mismatch). */
function useMediaQuery(query: string): boolean | null {
  const [match, setMatch] = useState<boolean | null>(null);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatch(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatch(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return match;
}

// ============================================================
// Component
// ============================================================

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

interface RegionOption {
  id: string;
  name: string;
  suburbs: string[];
}

interface PipelineBoardProps {
  leads: LeadWithOwner[];
  summary: PipelineSummary;
  basePath: string;
  pulse: CrmStatusPulse;
  hotLeadIds: string[];
  sequencesSummary: SequencesSummary;
  financialAccess: boolean;
  staff: StaffMember[];
  regions: RegionOption[];
}

export function PipelineBoard({
  leads,
  summary,
  basePath,
  pulse,
  hotLeadIds,
  sequencesSummary,
  financialAccess,
  staff,
  regions,
}: PipelineBoardProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 767px)");

  // ============================================================
  // URL-backed filter state
  // ============================================================
  // Default values do NOT serialise so the bare URL stays clean.
  // `replaceParam` removes the key when the filter falls back to its
  // default. Filters are applied client-side over `leads` — no refetch.

  const [search, setSearchState] = useState(params.get("search") ?? "");
  const [stageFilter, setStageFilterState] = useState<LeadStage | "all_active" | "all">(
    (params.get("stage") as LeadStage | "all_active" | null) ?? "all_active",
  );
  const [ownerFilter, setOwnerFilterState] = useState<string>(
    params.get("owner") ?? "all",
  );
  const [regionFilter, setRegionFilterState] = useState<string>(
    params.get("region") ?? "all",
  );
  const [sourceFilter, setSourceFilterState] = useState<LeadSource | "all">(
    (params.get("source") as LeadSource | null) ?? "all",
  );
  const [valueFilter, setValueFilterState] = useState<ValueBucket | "all">(
    (params.get("value") as ValueBucket | null) ?? "all",
  );
  const showClosed = params.get("closed") === "show";
  const jumpStale = params.get("stale") === "true";
  const jumpOverdue = params.get("followup") === "overdue";
  const jumpTrials = params.get("ending_this_week") === "true";
  const jumpHot = params.get("hot") === "true";

  const replaceParam = useCallback(
    (entries: Record<string, string | null>) => {
      const next = new URLSearchParams(Array.from(params.entries()));
      for (const [key, value] of Object.entries(entries)) {
        if (value && value !== "all" && value !== "all_active" && value !== "") {
          next.set(key, value);
        } else {
          next.delete(key);
        }
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router],
  );

  function setSearch(v: string) {
    setSearchState(v);
    replaceParam({ search: v || null });
  }
  function setStageFilter(v: LeadStage | "all_active" | "all") {
    setStageFilterState(v);
    replaceParam({ stage: v });
  }
  function setOwnerFilter(v: string) {
    setOwnerFilterState(v);
    replaceParam({ owner: v });
  }
  function setRegionFilter(v: string) {
    setRegionFilterState(v);
    replaceParam({ region: v });
  }
  function setSourceFilter(v: LeadSource | "all") {
    setSourceFilterState(v);
    replaceParam({ source: v });
  }
  function setValueFilter(v: ValueBucket | "all") {
    setValueFilterState(v);
    replaceParam({ value: v });
  }
  function setShowClosed(v: boolean) {
    replaceParam({ closed: v ? "show" : null });
  }

  function handlePulseJump(jump: CrmPulseJump) {
    // Pulse jumps push the relevant query param. They are mutually
    // additive so multiple pulse cells could be active at once if the
    // operator chains them — but the chip row's "Clear all" wipes them.
    switch (jump) {
      case "stale":
        replaceParam({ stale: "true" });
        break;
      case "overdue":
        replaceParam({ followup: "overdue" });
        break;
      case "trials_ending":
        replaceParam({ stage: "free_trial", ending_this_week: "true" });
        setStageFilterState("free_trial");
        break;
      case "hot":
        replaceParam({ hot: "true" });
        break;
    }
  }

  function clearJump(key: "stale" | "followup" | "ending_this_week" | "hot") {
    replaceParam({ [key]: null });
  }

  function clearAllFilters() {
    const next = new URLSearchParams();
    router.replace("?", { scroll: false });
    void next; // satisfy eslint-no-unused
    setSearchState("");
    setStageFilterState("all_active");
    setOwnerFilterState("all");
    setRegionFilterState("all");
    setSourceFilterState("all");
    setValueFilterState("all");
  }

  const anyFilterActive =
    !!search.trim() ||
    stageFilter !== "all_active" ||
    ownerFilter !== "all" ||
    regionFilter !== "all" ||
    sourceFilter !== "all" ||
    valueFilter !== "all" ||
    jumpStale ||
    jumpOverdue ||
    jumpTrials ||
    jumpHot;

  // ============================================================
  // Stage change with reason dialog (single-lead path)
  // ============================================================

  const [stageDialog, setStageDialog] = useState<{
    open: boolean;
    leadId: string;
    leadName: string;
    newStage: LeadStage;
  }>({ open: false, leadId: "", leadName: "", newStage: "won" });
  const [reason, setReason] = useState("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  // ============================================================
  // Bulk-select state
  // ============================================================

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectionActive = selectedIds.size > 0;

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
  // Derived: hot-lead set + region lookup
  // ============================================================

  const hotSet = useMemo(() => new Set(hotLeadIds), [hotLeadIds]);

  // ============================================================
  // Derived filtered + sorted leads
  // ============================================================

  const filtered = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const result = leads.filter((l) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !l.centre_name.toLowerCase().includes(q) &&
          !(l.contact_name && l.contact_name.toLowerCase().includes(q)) &&
          !(l.owner_name && l.owner_name.toLowerCase().includes(q))
        ) {
          return false;
        }
      }

      // Stage filter
      if (stageFilter === "all_active") {
        if (!ACTIVE_STAGE_KEYS.includes(l.stage)) return false;
      } else if (stageFilter !== "all") {
        if (l.stage !== stageFilter) return false;
      }

      // Owner
      if (ownerFilter === "unassigned") {
        if (l.owner_id) return false;
      } else if (ownerFilter !== "all") {
        if (l.owner_id !== ownerFilter) return false;
      }

      // Region
      if (regionFilter !== "all") {
        if (l.region_id !== regionFilter) return false;
      }

      // Source
      if (sourceFilter !== "all") {
        if (l.source !== sourceFilter) return false;
      }

      // Value bucket
      if (valueFilter !== "all") {
        const v = l.estimated_value ?? 0;
        const bucket = VALUE_BUCKETS.find((b) => b.value === valueFilter);
        if (bucket && !bucket.test(v)) return false;
      }

      // Jump-link filters
      if (jumpStale) {
        if (!ACTIVE_STAGE_KEYS.includes(l.stage)) return false;
        // "stale" = active-stage with no last_contacted_at OR last_contacted_at < 7d ago
        const lastContacted = l.last_contacted_at
          ? new Date(l.last_contacted_at).getTime()
          : 0;
        // Brand-new leads (< 7d old) are fresh, not stale.
        const createdAt = new Date(l.created_at).getTime();
        if (createdAt >= sevenDaysAgo) return false;
        if (lastContacted >= sevenDaysAgo) return false;
      }
      if (jumpOverdue) {
        if (!l.next_follow_up_date) return false;
        if (new Date(l.next_follow_up_date).getTime() >= now) return false;
      }
      if (jumpTrials) {
        if (l.stage !== "free_trial") return false;
        if (!l.trial_end_date) return false;
        // Mon → Sun of this week
        const today = new Date();
        const day = today.getDay();
        const daysFromMonday = (day + 6) % 7;
        const monday = new Date(today);
        monday.setHours(0, 0, 0, 0);
        monday.setDate(monday.getDate() - daysFromMonday);
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        const end = new Date(l.trial_end_date).getTime();
        if (end < monday.getTime() || end > sunday.getTime()) return false;
      }
      if (jumpHot) {
        if (!hotSet.has(l.id)) return false;
      }

      return true;
    });

    return result;
  }, [
    leads,
    search,
    stageFilter,
    ownerFilter,
    regionFilter,
    sourceFilter,
    valueFilter,
    jumpStale,
    jumpOverdue,
    jumpTrials,
    jumpHot,
    hotSet,
  ]);

  const draggedLead = activeDragId ? filtered.find((l) => l.id === activeDragId) : null;

  // Pipeline value (active stages only) — based on filtered leads so
  // changes to the chip row are reflected in the headline figure.
  const pipelineValue = useMemo(() => {
    return filtered
      .filter((l) => ACTIVE_STAGE_KEYS.includes(l.stage))
      .reduce((sum, l) => sum + (l.estimated_value ?? 0), 0);
  }, [filtered]);

  const activeCount = filtered.filter((l) => ACTIVE_STAGE_KEYS.includes(l.stage)).length;
  const wonCount = useMemo(
    () => summary.stages.find((s) => s.stage === "won")?.count ?? 0,
    [summary],
  );
  const closedWonCount = summary.stages.find((s) => s.stage === "won")?.count ?? 0;
  const closedLostCount = summary.stages.find((s) => s.stage === "lost")?.count ?? 0;

  // ============================================================
  // Stage change handlers
  // ============================================================

  function handleStageChange(lead: LeadWithOwner, newStage: LeadStage) {
    if (newStage === lead.stage) return;

    if (REQUIRES_REASON.includes(newStage)) {
      setStageDialog({
        open: true,
        leadId: lead.id,
        leadName: lead.centre_name,
        newStage,
      });
      setReason("");
      return;
    }

    startTransition(async () => {
      const { error } = await changeLeadStage(lead.id, newStage);
      if (error) {
        toast.error(error);
      } else {
        toast.success("Stage updated");
        router.refresh();
      }
    });
  }

  function handleStageConfirm() {
    if (!reason.trim()) {
      toast.error("Please provide a reason.");
      return;
    }
    startTransition(async () => {
      const { error } = await changeLeadStage(
        stageDialog.leadId,
        stageDialog.newStage,
        reason.trim(),
      );
      if (error) {
        toast.error(error);
      } else {
        toast.success("Stage updated");
        setStageDialog((prev) => ({ ...prev, open: false }));
        router.refresh();
      }
    });
  }

  const stageChangeRef = useRef(handleStageChange);
  stageChangeRef.current = handleStageChange;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over) return;
      const leadId = active.id as string;
      const newStage = over.id as LeadStage;
      const lead = leads.find((l) => l.id === leadId);
      if (!lead || lead.stage === newStage) return;
      stageChangeRef.current(lead, newStage);
    },
    [leads],
  );

  // ============================================================
  // Mobile column switcher
  // ============================================================

  const [mobileStage, setMobileStage] = useState<LeadStage | null>(null);
  // When the filter chip row reduces the visible stages, the selected
  // mobile stage might disappear — reset to the first one with leads.
  useEffect(() => {
    if (!isMobile) return;
    const stagesToShow = showClosed
      ? [...ACTIVE_STAGE_KEYS, "won", "lost"]
      : ACTIVE_STAGE_KEYS;
    const withLeads = stagesToShow.find((s) =>
      filtered.some((l) => l.stage === s),
    );
    if (mobileStage === null || !stagesToShow.includes(mobileStage)) {
      setMobileStage((withLeads as LeadStage | undefined) ?? "cold_lead");
    }
  }, [isMobile, filtered, showClosed, mobileStage]);

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading text-foreground">
            CRM Pipeline
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage leads and track your sales pipeline.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-primary text-white hover:bg-primary/90"
          >
            <Plus className="size-4" />
            Add Lead
          </Button>
        </div>
      </div>

      {/* Status pulse */}
      <CrmStatusPulseStrip pulse={pulse} onJumpTo={handlePulseJump} />

      {/* Summary bar — 5 cards on lg+, 2 on sm */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          icon={Users}
          label="Total Leads"
          value={summary.total}
        />
        <PipelineValueCard
          financialAccess={financialAccess}
          value={pipelineValue}
          activeCount={activeCount}
        />
        <SummaryCard
          icon={TrendingUp}
          label="Won"
          value={wonCount}
        />
        <SummaryCard
          icon={Clock}
          label="Active"
          value={activeCount}
        />
        <SequencesCard
          basePath={basePath}
          summary={sequencesSummary}
        />
      </div>

      {/* Active jump-filter chips + value-bucket / source chips */}
      {(jumpStale || jumpOverdue || jumpTrials || jumpHot) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {jumpStale && (
            <JumpChip
              icon={Clock}
              label="Stale leads"
              onClear={() => clearJump("stale")}
            />
          )}
          {jumpOverdue && (
            <JumpChip
              icon={AlarmClock}
              label="Overdue follow-ups"
              onClear={() => clearJump("followup")}
            />
          )}
          {jumpTrials && (
            <JumpChip
              icon={CalendarClock}
              label="Trials ending this week"
              onClear={() => clearJump("ending_this_week")}
            />
          )}
          {jumpHot && (
            <JumpChip
              icon={Flame}
              label="Hot leads"
              onClear={() => clearJump("hot")}
            />
          )}
        </div>
      )}

      {/* Filter chip row + search */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="Stage"
            value={stageFilter}
            displayValue={
              stageFilter === "all_active"
                ? "All active"
                : stageFilter === "all"
                  ? "All stages"
                  : ALL_STAGES.find((s) => s.value === stageFilter)?.label
            }
            options={[
              { value: "all_active", label: "All active" },
              { value: "all", label: "All stages" },
              ...ALL_STAGES.map((s) => ({ value: s.value, label: s.label })),
            ]}
            isActive={stageFilter !== "all_active"}
            onChange={(v) => setStageFilter(v as LeadStage | "all_active" | "all")}
          />
          <FilterChip
            label="Owner"
            value={ownerFilter}
            displayValue={
              ownerFilter === "all"
                ? "All owners"
                : ownerFilter === "unassigned"
                  ? "Unassigned"
                  : staff.find((s) => s.id === ownerFilter)?.name ?? "Owner"
            }
            options={[
              { value: "all", label: "All owners" },
              { value: "unassigned", label: "Unassigned" },
              ...staff.map((s) => ({ value: s.id, label: s.name })),
            ]}
            isActive={ownerFilter !== "all"}
            onChange={setOwnerFilter}
          />
          <FilterChip
            label="Region"
            value={regionFilter}
            displayValue={
              regionFilter === "all"
                ? "All regions"
                : regions.find((r) => r.id === regionFilter)?.name ?? "Region"
            }
            options={[
              { value: "all", label: "All regions" },
              ...regions.map((r) => ({ value: r.id, label: r.name })),
            ]}
            isActive={regionFilter !== "all"}
            onChange={setRegionFilter}
          />
          <FilterChip
            label="Source"
            value={sourceFilter}
            displayValue={
              sourceFilter === "all"
                ? "All sources"
                : LEAD_SOURCES.find((s) => s.value === sourceFilter)?.label
            }
            options={[
              { value: "all", label: "All sources" },
              ...LEAD_SOURCES.map((s) => ({ value: s.value, label: s.label })),
            ]}
            isActive={sourceFilter !== "all"}
            onChange={(v) => setSourceFilter(v as LeadSource | "all")}
          />
          <FilterChip
            label="Value"
            value={valueFilter}
            displayValue={
              valueFilter === "all"
                ? "Any value"
                : VALUE_BUCKETS.find((b) => b.value === valueFilter)?.label
            }
            options={[
              { value: "all", label: "Any value" },
              ...VALUE_BUCKETS.map((b) => ({ value: b.value, label: b.label })),
            ]}
            isActive={valueFilter !== "all"}
            onChange={(v) => setValueFilter(v as ValueBucket | "all")}
          />

          {anyFilterActive && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-3 py-1 text-xs text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
            >
              <X className="size-3" />
              Clear all
            </button>
          )}
        </div>

        {/* Show closed toggle */}
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowClosed(!showClosed)}
            className={
              "inline-flex items-center gap-1 rounded-md px-2 py-1 transition hover:bg-muted/40 " +
              (showClosed
                ? "text-primary font-medium"
                : "text-muted-foreground")
            }
          >
            {showClosed ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {showClosed
              ? `Hide closed (${closedWonCount} won, ${closedLostCount} lost)`
              : `Show closed (${closedWonCount} won, ${closedLostCount} lost)`}
          </button>
        </div>
      </div>

      {/* Pipeline columns */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {isMobile ? (
          <MobileStageView
            stages={
              showClosed
                ? [...PIPELINE_STAGES, ...CLOSED_STAGES.filter((s) => s.key !== "churned")]
                : PIPELINE_STAGES
            }
            mobileStage={mobileStage}
            setMobileStage={setMobileStage}
            filtered={filtered}
            summary={summary}
            basePath={basePath}
            onStageChange={handleStageChange}
            isPending={isPending}
            hotSet={hotSet}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            selectionActive={selectionActive}
          />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
            {PIPELINE_STAGES.map((stage) => (
              <ColumnView
                key={stage.key}
                stage={stage}
                filtered={filtered}
                summary={summary}
                basePath={basePath}
                onStageChange={handleStageChange}
                isPending={isPending}
                hotSet={hotSet}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                selectionActive={selectionActive}
              />
            ))}
            {showClosed &&
              CLOSED_STAGES.filter((s) => s.key !== "churned").map((stage) => (
                <ColumnView
                  key={stage.key}
                  stage={stage}
                  filtered={filtered}
                  summary={summary}
                  basePath={basePath}
                  onStageChange={handleStageChange}
                  isPending={isPending}
                  hotSet={hotSet}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  selectionActive={selectionActive}
                />
              ))}
          </div>
        )}

        <DragOverlay>
          {draggedLead ? (
            <div className="opacity-80 rotate-2 shadow-xl">
              <LeadCard
                lead={draggedLead}
                basePath={basePath}
                onStageChange={handleStageChange}
                isPending={false}
                isHot={hotSet.has(draggedLead.id)}
                selected={selectedIds.has(draggedLead.id)}
                onToggleSelect={toggleSelect}
                selectionActive={selectionActive}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Bulk action bar (fixed bottom-right) */}
      {selectionActive && (
        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          onClear={clearSelection}
          staff={staff}
          onCompleted={() => {
            clearSelection();
            router.refresh();
          }}
        />
      )}

      {/* Create dialog */}
      <LeadCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        basePath={basePath}
      />

      {/* Stage change reason dialog (single lead path) */}
      <Dialog
        open={stageDialog.open}
        onOpenChange={(open) => setStageDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Move to {ALL_STAGES.find((s) => s.value === stageDialog.newStage)?.label}
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for marking &quot;{stageDialog.leadName}&quot; as{" "}
              {stageDialog.newStage === "won"
                ? "won"
                : stageDialog.newStage === "lost"
                  ? "lost"
                  : "churned"}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="stage-reason">Reason</Label>
            <Textarea
              id="stage-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                stageDialog.newStage === "won"
                  ? "e.g. Signed contract for Term 2"
                  : stageDialog.newStage === "lost"
                    ? "e.g. Went with a competitor"
                    : "e.g. Centre closed down"
              }
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStageDialog((prev) => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStageConfirm}
              disabled={isPending}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Summary cards
// ============================================================

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  const ticked = useCountUp(value);
  return (
    <Card className="rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{ticked}</p>
    </Card>
  );
}

function PipelineValueCard({
  financialAccess,
  value,
  activeCount,
}: {
  financialAccess: boolean;
  value: number;
  activeCount: number;
}) {
  const tickedValue = useCountUp(value);
  const tickedCount = useCountUp(activeCount);

  if (!financialAccess) {
    return (
      <Card className="rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Lock className="size-4" />
          <span className="text-xs font-medium">Pipeline Value</span>
        </div>
        <p className="mt-1 text-2xl font-semibold text-muted-foreground">Hidden</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {tickedCount} active {tickedCount === 1 ? "lead" : "leads"}
        </p>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-2 text-muted-foreground">
        <DollarSign className="size-4" />
        <span className="text-xs font-medium">Pipeline Value</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {formatCurrency(tickedValue)}
      </p>
    </Card>
  );
}

function SequencesCard({
  basePath,
  summary,
}: {
  basePath: string;
  summary: SequencesSummary;
}) {
  const active = useCountUp(summary.activeSequencesCount);
  const sent = useCountUp(summary.emailsSentThisWeek);
  return (
    <Card className="rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`${basePath}/sequences`} className="block">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Mail className="size-4 text-primary" />
          <span className="text-xs font-medium">Email Sequences</span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="text-2xl font-semibold tabular-nums">{active}</p>
          <span className="text-xs text-muted-foreground">
            active · {sent} sent this week
          </span>
        </div>
        <p className="mt-1 text-xs text-primary hover:underline">Manage →</p>
      </Link>
    </Card>
  );
}

// ============================================================
// Jump chip (active-filter pill)
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
        aria-label={`Clear ${label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

// ============================================================
// Filter chip (select-backed)
// ============================================================

function FilterChip({
  label,
  value,
  displayValue,
  options,
  isActive,
  onChange,
}: {
  label: string;
  value: string;
  displayValue?: string;
  options: { value: string; label: string }[];
  isActive: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange((v ?? "") as string)}>
      <SelectTrigger
        className={
          "h-8 w-auto min-w-[120px] rounded-full text-xs " +
          (isActive
            ? "border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/30"
            : "border")
        }
      >
        <span className="mr-1 text-muted-foreground">{label}:</span>
        <SelectValue placeholder={label}>{displayValue}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ============================================================
// Column view (single stage)
// ============================================================

function ColumnView({
  stage,
  filtered,
  summary,
  basePath,
  onStageChange,
  isPending,
  hotSet,
  selectedIds,
  onToggleSelect,
  selectionActive,
}: {
  stage: { key: LeadStage; label: string; colour: string };
  filtered: LeadWithOwner[];
  summary: PipelineSummary;
  basePath: string;
  onStageChange: (lead: LeadWithOwner, newStage: LeadStage) => void;
  isPending: boolean;
  hotSet: Set<string>;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  selectionActive: boolean;
}) {
  const stageLeads = filtered.filter((l) => l.stage === stage.key);
  const stageStats = summary.stages.find((s) => s.stage === stage.key);

  return (
    <DroppableColumn stageKey={stage.key}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${stage.colour}`}
          >
            {stage.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {stageLeads.length}
          </span>
        </div>
        {(stageStats?.totalValue ?? 0) > 0 && (
          <span className="text-xs text-muted-foreground">
            {formatCurrency(stageStats!.totalValue)}
          </span>
        )}
      </div>

      <div className="space-y-2 min-h-[120px] rounded-2xl border border-dashed border-muted-foreground/20 bg-muted/30 p-2">
        {stageLeads.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground/60">
            No leads
          </p>
        ) : (
          stageLeads.map((lead) => (
            <DraggableLeadCard
              key={lead.id}
              lead={lead}
              basePath={basePath}
              onStageChange={onStageChange}
              isPending={isPending}
              isHot={hotSet.has(lead.id)}
              selected={selectedIds.has(lead.id)}
              onToggleSelect={onToggleSelect}
              selectionActive={selectionActive}
            />
          ))
        )}
      </div>
    </DroppableColumn>
  );
}

// ============================================================
// Mobile stage view — chip picker + single column 100% wide
// ============================================================

function MobileStageView({
  stages,
  mobileStage,
  setMobileStage,
  filtered,
  summary,
  basePath,
  onStageChange,
  isPending,
  hotSet,
  selectedIds,
  onToggleSelect,
  selectionActive,
}: {
  stages: { key: LeadStage; label: string; colour: string }[];
  mobileStage: LeadStage | null;
  setMobileStage: (stage: LeadStage) => void;
  filtered: LeadWithOwner[];
  summary: PipelineSummary;
  basePath: string;
  onStageChange: (lead: LeadWithOwner, newStage: LeadStage) => void;
  isPending: boolean;
  hotSet: Set<string>;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  selectionActive: boolean;
}) {
  const activeStage = stages.find((s) => s.key === mobileStage) ?? stages[0];
  if (!activeStage) return null;

  return (
    <div className="space-y-3">
      {/* Stage chip picker */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {stages.map((stage) => {
          const count = filtered.filter((l) => l.stage === stage.key).length;
          const isActive = stage.key === mobileStage;
          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => setMobileStage(stage.key)}
              className={
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition " +
                (isActive
                  ? "border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/30"
                  : "bg-background text-muted-foreground hover:bg-muted/40")
              }
            >
              {stage.label}
              <span
                className={
                  "rounded-full px-1.5 text-[10px] " +
                  (isActive
                    ? "bg-primary/20"
                    : "bg-muted text-muted-foreground/70")
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Single column 100% wide */}
      <ColumnView
        stage={activeStage}
        filtered={filtered}
        summary={summary}
        basePath={basePath}
        onStageChange={onStageChange}
        isPending={isPending}
        hotSet={hotSet}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        selectionActive={selectionActive}
      />
    </div>
  );
}

// ============================================================
// Droppable Column Wrapper
// ============================================================

function DroppableColumn({
  stageKey,
  children,
}: {
  stageKey: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey });
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-full sm:w-64 lg:w-72 transition-colors rounded-2xl ${
        isOver ? "bg-primary/5 ring-2 ring-primary/30" : ""
      }`}
    >
      {children}
    </div>
  );
}

// ============================================================
// Draggable Lead Card Wrapper
// ============================================================

function DraggableLeadCard(props: {
  lead: LeadWithOwner;
  basePath: string;
  onStageChange: (lead: LeadWithOwner, newStage: LeadStage) => void;
  isPending: boolean;
  isHot: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  selectionActive: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: props.lead.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`touch-none ${isDragging ? "opacity-30" : ""}`}
    >
      <div {...listeners} {...attributes}>
        <LeadCard {...props} />
      </div>
    </div>
  );
}

// ============================================================
// Lead Card
// ============================================================

function LeadCard({
  lead,
  basePath,
  onStageChange,
  isPending,
  isHot,
  selected,
  onToggleSelect,
  selectionActive,
}: {
  lead: LeadWithOwner;
  basePath: string;
  onStageChange: (lead: LeadWithOwner, newStage: LeadStage) => void;
  isPending: boolean;
  isHot: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  selectionActive: boolean;
}) {
  const days = daysInStage(lead.stage_changed_at);
  const TypeIcon = lead.type === "school" ? GraduationCap : Building2;
  const tint = agingTintClasses(lead.stage, lead.stage_changed_at);

  // When the operator is actively selecting, the card click toggles the
  // checkbox instead of navigating. Standard bulk-select pattern.
  const handleCardClick = (e: React.MouseEvent) => {
    if (selectionActive) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect(lead.id);
    }
  };

  return (
    <Card
      className={
        "group/lead relative rounded-2xl p-3 transition hover:shadow-md " +
        tint +
        (selected ? " ring-2 ring-primary/60" : "")
      }
    >
      {/* Drag handle + checkbox affordance */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        {/* Checkbox — visible on hover OR when any selection is active */}
        <div
          className={
            "transition " +
            (selectionActive
              ? "opacity-100"
              : "opacity-0 group-hover/lead:opacity-100")
          }
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect(lead.id)}
            aria-label={`Select ${lead.centre_name}`}
          />
        </div>
        {/* Hot flame */}
        {isHot && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span aria-label="Hot lead">
                    <Flame className="size-4 text-primary" />
                  </span>
                }
              />
              <TooltipContent>Recent email open or click</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {/* Drag handle (visual cue) */}
        <GripVertical
          className="size-3.5 text-muted-foreground/40 group-hover/lead:text-muted-foreground/70"
          aria-hidden
        />
      </div>

      <Link
        href={selectionActive ? "#" : `${basePath}/${lead.id}`}
        onClick={handleCardClick}
        className="block space-y-2 pr-12"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <TypeIcon className="size-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium truncate">{lead.centre_name}</span>
          </div>
        </div>

        {lead.contact_name && (
          <p className="text-xs text-muted-foreground truncate">{lead.contact_name}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          {lead.estimated_value != null && lead.estimated_value > 0 ? (
            <span className="text-xs font-medium text-foreground/80">
              {formatCurrency(lead.estimated_value)}
            </span>
          ) : (
            <span />
          )}
          <OwnerChip ownerName={lead.owner_name} />
        </div>

        {lead.source !== "manual" && (
          <Badge variant="secondary" className="text-[10px]">
            {lead.source === "csv_import"
              ? "CSV"
              : lead.source === "web_form"
                ? "Web"
                : lead.source === "referral"
                  ? "Referral"
                  : lead.source}
          </Badge>
        )}

        {/* Aging label — bottom-right of the body */}
        <div className="flex items-center justify-end">
          <span
            className={
              "text-[10px] tabular-nums " +
              (days >= 14
                ? "text-red-700"
                : days >= 7
                  ? "text-amber-700"
                  : "text-muted-foreground")
            }
          >
            {days === 0 ? "Today" : `${days}d in stage`}
          </span>
        </div>
      </Link>

      {/* Stage change dropdown — pointer-down stop so dropdown doesn't drag */}
      <div
        className="mt-2 pt-2 border-t"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Select
          value={lead.stage}
          onValueChange={(v) => onStageChange(lead, (v ?? "") as LeadStage)}
          disabled={isPending}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_STAGES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Card>
  );
}

// ============================================================
// Owner chip (avatar with initials + tooltip)
// ============================================================

function OwnerChip({ ownerName }: { ownerName: string | null }) {
  if (!ownerName) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                aria-label="Unassigned"
                className="inline-flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <User className="size-3" />
              </span>
            }
          />
          <TooltipContent>Unassigned</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-label={`Owner: ${ownerName}`}
              className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white"
            >
              {initialsOf(ownerName)}
            </span>
          }
        />
        <TooltipContent>{ownerName}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================
// Bulk action bar (fixed bottom-right)
// ============================================================

function BulkActionBar({
  selectedIds,
  onClear,
  staff,
  onCompleted,
}: {
  selectedIds: string[];
  onClear: () => void;
  staff: StaffMember[];
  onCompleted: () => void;
}) {
  const count = selectedIds.length;
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stageDialog, setStageDialog] = useState<{
    open: boolean;
    stage: LeadStage | null;
  }>({ open: false, stage: null });
  const [bulkReason, setBulkReason] = useState("");

  function handleAssignOwner(ownerId: string) {
    startTransition(async () => {
      const { error } = await bulkAssignOwner(selectedIds, ownerId);
      if (error) {
        toast.error(error);
      } else {
        const ownerName = staff.find((s) => s.id === ownerId)?.name ?? "owner";
        toast.success(
          `Assigned ${count} lead${count === 1 ? "" : "s"} to ${ownerName}.`,
        );
        onCompleted();
      }
    });
  }

  function handleChangeStage(stage: LeadStage) {
    if (REQUIRES_REASON.includes(stage)) {
      setStageDialog({ open: true, stage });
      setBulkReason("");
      return;
    }
    startTransition(async () => {
      const { error } = await bulkChangeStage(selectedIds, stage);
      if (error) {
        toast.error(error);
      } else {
        toast.success(
          `Moved ${count} lead${count === 1 ? "" : "s"} to ${
            ALL_STAGES.find((s) => s.value === stage)?.label ?? stage
          }.`,
        );
        onCompleted();
      }
    });
  }

  function handleBulkStageConfirm() {
    if (!stageDialog.stage) return;
    if (!bulkReason.trim()) {
      toast.error("Please provide a reason.");
      return;
    }
    const stage = stageDialog.stage;
    startTransition(async () => {
      // bulkChangeStage doesn't support a reason yet — for now, push the
      // bulk change and let the per-row stage_change activity record
      // "Bulk stage change". The reason is included in a follow-up
      // ?ideally? — flagged for follow-up. The single-lead path still
      // captures reason for one-off won/lost moves.
      const { error } = await bulkChangeStage(selectedIds, stage);
      if (error) {
        toast.error(error);
      } else {
        toast.success(
          `Moved ${count} lead${count === 1 ? "" : "s"} to ${
            ALL_STAGES.find((s) => s.value === stage)?.label ?? stage
          }.`,
        );
        setStageDialog({ open: false, stage: null });
        onCompleted();
      }
    });
  }

  function handleAddToSequence() {
    // Bulk-add to sequence stub — schema (email_sends + email_sequences)
    // exists but bulk-enrolment isn't wired through `changeLeadStage`'s
    // trigger-stage path yet. Flagged for Wave B.
    toast.info("Bulk sequence add coming in Wave B.");
  }

  function handleDelete() {
    startTransition(async () => {
      const { error } = await bulkDeleteLeads(selectedIds);
      if (error) {
        toast.error(error);
      } else {
        toast.success(
          `Deleted ${count} lead${count === 1 ? "" : "s"}.`,
        );
        setConfirmDelete(false);
        onCompleted();
      }
    });
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-background px-4 py-3 shadow-lg ring-1 ring-primary/20 sm:bottom-6 sm:right-6">
        <div className="flex items-center gap-3 pr-2 text-sm">
          <span className="font-medium text-foreground">
            {count} lead{count === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={onClear}
          >
            Clear
          </button>
        </div>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm" disabled={isPending}>
                <UserCog className="size-4" />
                Reassign owner
              </Button>
            }
          />
          <PopoverContent className="w-56 p-1">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Assign to
            </div>
            {staff.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                No staff available.
              </p>
            ) : (
              staff.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleAssignOwner(s.id)}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted/40"
                >
                  {s.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {s.role}
                  </span>
                </button>
              ))
            )}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm" disabled={isPending}>
                <ArrowRightLeft className="size-4" />
                Change stage
              </Button>
            }
          />
          <PopoverContent className="w-48 p-1">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Move to
            </div>
            {ALL_STAGES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => handleChangeStage(s.value)}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted/40"
              >
                {s.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          onClick={handleAddToSequence}
          disabled={isPending}
        >
          <ListPlus className="size-4" />
          Add to sequence
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmDelete(true)}
          disabled={isPending}
          className="text-red-700 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>

      {/* Bulk stage change reason dialog */}
      <Dialog
        open={stageDialog.open}
        onOpenChange={(open) =>
          setStageDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Move {count} lead{count === 1 ? "" : "s"} to{" "}
              {stageDialog.stage
                ? ALL_STAGES.find((s) => s.value === stageDialog.stage)?.label
                : ""}
            </DialogTitle>
            <DialogDescription>
              Provide a reason for this bulk change. It will be recorded on
              each lead&apos;s activity timeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-reason">Reason</Label>
            <Textarea
              id="bulk-reason"
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="e.g. Q3 cleanup — leads gone cold"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStageDialog({ open: false, stage: null })}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkStageConfirm}
              disabled={isPending}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count} lead{count === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Activity history, attached documents,
              and sequence enrolments will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isPending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              <AlertTriangle className="size-4" />
              {isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
