"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { LeadCreateDialog } from "./lead-create-dialog";
import { changeLeadStage } from "@/lib/crm/actions";
import type { LeadWithOwner, PipelineSummary } from "@/lib/crm/actions";
import type { LeadStage } from "@/lib/types/enums";

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

const CLOSED_STAGES: { key: LeadStage; label: string; variant: "default" | "destructive" | "secondary" }[] = [
  { key: "won", label: "Won", variant: "default" },
  { key: "lost", label: "Lost", variant: "destructive" },
  { key: "churned", label: "Churned", variant: "secondary" },
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

const REQUIRES_REASON: LeadStage[] = ["won", "lost", "churned"];

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

function isRecentClosed(lead: LeadWithOwner): boolean {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return new Date(lead.stage_changed_at) >= thirtyDaysAgo;
}

// ============================================================
// Component
// ============================================================

interface PipelineBoardProps {
  leads: LeadWithOwner[];
  summary: PipelineSummary;
  basePath: string;
}

export function PipelineBoard({ leads, summary, basePath }: PipelineBoardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // Stage change with reason dialog
  const [stageDialog, setStageDialog] = useState<{
    open: boolean;
    leadId: string;
    leadName: string;
    newStage: LeadStage;
  }>({ open: false, leadId: "", leadName: "", newStage: "won" });
  const [reason, setReason] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.centre_name.toLowerCase().includes(q) ||
        (l.contact_name && l.contact_name.toLowerCase().includes(q)) ||
        (l.owner_name && l.owner_name.toLowerCase().includes(q))
    );
  }, [leads, search]);

  // Pipeline value (active stages only)
  const pipelineValue = useMemo(() => {
    return summary.stages
      .filter((s) => !["won", "lost", "churned"].includes(s.stage))
      .reduce((sum, s) => sum + s.totalValue, 0);
  }, [summary]);

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
        reason.trim()
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
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Add Lead
        </Button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="text-xs font-medium">Total Leads</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">{summary.total}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="size-4" />
            <span className="text-xs font-medium">Pipeline Value</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(pipelineValue)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="size-4" />
            <span className="text-xs font-medium">Won</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">
            {summary.stages.find((s) => s.stage === "won")?.count ?? 0}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="size-4" />
            <span className="text-xs font-medium">Active</span>
          </div>
          <p className="mt-1 text-2xl font-semibold">
            {summary.stages
              .filter((s) => !["won", "lost", "churned"].includes(s.stage))
              .reduce((sum, s) => sum + s.count, 0)}
          </p>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Pipeline columns */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = filtered.filter((l) => l.stage === stage.key);
          const stageStats = summary.stages.find((s) => s.stage === stage.key);

          return (
            <div
              key={stage.key}
              className="flex-shrink-0 w-72 sm:w-64 lg:w-72"
            >
              {/* Column header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${stage.colour}`}>
                    {stage.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {stageStats?.count ?? 0}
                  </span>
                </div>
                {(stageStats?.totalValue ?? 0) > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(stageStats!.totalValue)}
                  </span>
                )}
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[120px] rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 p-2">
                {stageLeads.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground/60">
                    No leads
                  </p>
                ) : (
                  stageLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      basePath={basePath}
                      onStageChange={handleStageChange}
                      isPending={isPending}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Closed stages */}
      <div className="space-y-3">
        {CLOSED_STAGES.map((stage) => {
          const stageLeads = filtered
            .filter((l) => l.stage === stage.key && isRecentClosed(l));

          return (
            <Collapsible key={stage.key}>
              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border bg-card p-3 text-sm font-medium hover:bg-muted/50 transition-colors">
                <ChevronRight className="size-4 text-muted-foreground [[data-open]>&]:hidden" />
                <ChevronDown className="size-4 text-muted-foreground hidden [[data-open]>&]:block" />
                <Badge variant={stage.variant}>{stage.label}</Badge>
                <span className="text-muted-foreground">
                  {stageLeads.length} in last 30 days
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {stageLeads.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    No {stage.label.toLowerCase()} leads in the last 30 days.
                  </p>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {stageLeads.map((lead) => (
                      <ClosedLeadCard
                        key={lead.id}
                        lead={lead}
                        basePath={basePath}
                      />
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {/* Create dialog */}
      <LeadCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        basePath={basePath}
      />

      {/* Stage change reason dialog */}
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
            <Button onClick={handleStageConfirm} disabled={isPending}>
              {isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Lead Card (pipeline column)
// ============================================================

function LeadCard({
  lead,
  basePath,
  onStageChange,
  isPending,
}: {
  lead: LeadWithOwner;
  basePath: string;
  onStageChange: (lead: LeadWithOwner, newStage: LeadStage) => void;
  isPending: boolean;
}) {
  const days = daysInStage(lead.stage_changed_at);
  const TypeIcon = lead.type === "school" ? GraduationCap : Building2;

  return (
    <Card className="p-3 hover:shadow-md transition-shadow">
      <Link href={`${basePath}/${lead.id}`} className="block space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <TypeIcon className="size-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium truncate">{lead.centre_name}</span>
          </div>
          {lead.type && (
            <Badge variant="outline" className="text-[10px] flex-shrink-0">
              {lead.type === "childcare_centre" ? "Childcare" : "School"}
            </Badge>
          )}
        </div>

        {lead.contact_name && (
          <p className="text-xs text-muted-foreground truncate">{lead.contact_name}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          {lead.estimated_value != null && lead.estimated_value > 0 ? (
            <span className="text-xs font-medium text-green-700">
              {formatCurrency(lead.estimated_value)}
            </span>
          ) : (
            <span />
          )}
          <span className="text-[10px] text-muted-foreground">
            {days === 0 ? "Today" : `${days}d`}
          </span>
        </div>

        {(lead.source !== "manual" || lead.owner_name) && (
          <div className="flex items-center justify-between gap-2">
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
            {lead.owner_name && (
              <span className="text-[10px] text-muted-foreground truncate">
                {lead.owner_name}
              </span>
            )}
          </div>
        )}
      </Link>

      {/* Stage change dropdown */}
      <div className="mt-2 pt-2 border-t">
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
// Closed Lead Card (won/lost/churned sections)
// ============================================================

function ClosedLeadCard({
  lead,
  basePath,
}: {
  lead: LeadWithOwner;
  basePath: string;
}) {
  const TypeIcon = lead.type === "school" ? GraduationCap : Building2;
  const reasonText =
    lead.stage === "lost"
      ? lead.lost_reason
      : lead.stage === "churned"
      ? lead.churn_reason
      : null;

  return (
    <Card className="p-3 hover:shadow-md transition-shadow">
      <Link href={`${basePath}/${lead.id}`} className="block space-y-1.5">
        <div className="flex items-center gap-1.5">
          <TypeIcon className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{lead.centre_name}</span>
        </div>
        {lead.contact_name && (
          <p className="text-xs text-muted-foreground">{lead.contact_name}</p>
        )}
        {reasonText && (
          <p className="text-xs text-muted-foreground italic truncate">
            {reasonText}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          {new Date(lead.stage_changed_at).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </Link>
    </Card>
  );
}
