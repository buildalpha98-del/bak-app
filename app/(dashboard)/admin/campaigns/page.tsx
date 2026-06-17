"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Megaphone,
  Users,
  TrendingUp,
  Pause,
  Play,
  Eye,
  ChevronDown,
  ChevronUp,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getCampaigns,
  getCampaignDetail,
  updateCampaignStatus,
  getCampaignReporting,
  bulkUpdateCampaignStatus,
} from "@/lib/reengagement/campaign-actions";
import { getCampaignsStatusPulse } from "@/lib/reengagement/status-pulse-actions";
import type { CampaignsStatusPulse } from "@/lib/reengagement/status-pulse-actions";
import { CampaignsStatusPulseStrip } from "@/components/campaigns/campaigns-status-pulse";
import { useCountUp } from "@/components/launch/use-count-up";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Campaign {
  id: string;
  name: string;
  audience_type: string;
  status: string;
  created_at: string;
  total_sends: number;
  engaged_count: number;
  engagement_rate: number;
}

interface CampaignSend {
  id: string;
  recipient_type: string;
  recipient_id: string;
  trigger_reason: string;
  status: string;
  triggered_at: string;
  engaged_at: string | null;
}

interface AudienceReport {
  audienceType: string;
  totalSends: number;
  totalEngaged: number;
  engagementRate: number;
}

interface ReportingData {
  byAudienceType: AudienceReport[];
  totals: {
    totalSends: number;
    totalEngaged: number;
    overallEngagementRate: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUDIENCE_CONFIG: Record<
  string,
  { label: string; colour: string; bg: string }
> = {
  dormant_parents: {
    label: "Dormant Parents",
    colour: "text-blue-700",
    bg: "bg-blue-100",
  },
  declining_centres: {
    label: "Declining Centres",
    colour: "text-amber-700",
    bg: "bg-amber-100",
  },
  cold_leads: {
    label: "Cold Leads",
    colour: "text-purple-700",
    bg: "bg-purple-100",
  },
  untrained_coaches: {
    label: "Untrained Coaches",
    colour: "text-orange-700",
    bg: "bg-orange-100",
  },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; colour: string; bg: string; dot: string }
> = {
  active: {
    label: "Active",
    colour: "text-green-700",
    bg: "bg-green-100",
    dot: "bg-green-500",
  },
  paused: {
    label: "Paused",
    colour: "text-amber-700",
    bg: "bg-amber-100",
    dot: "bg-amber-500",
  },
  inactive: {
    label: "Inactive",
    colour: "text-gray-600",
    bg: "bg-gray-100",
    dot: "bg-gray-400",
  },
};

const SEND_STATUS_ICON: Record<string, React.ReactNode> = {
  sent: <Mail className="h-3.5 w-3.5 text-blue-500" />,
  pending: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  engaged: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function audienceBadge(type: string) {
  const cfg = AUDIENCE_CONFIG[type] ?? {
    label: type,
    colour: "text-gray-700",
    bg: "bg-gray-100",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.colour}`}
    >
      {cfg.label}
    </span>
  );
}

function statusBadge(status: string) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    colour: "text-gray-600",
    bg: "bg-gray-100",
    dot: "bg-gray-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.colour}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AnimatedMetric({ value }: { value: number }) {
  const ticked = useCountUp(value);
  return <>{ticked}</>;
}

export default function AdminCampaignsPage() {
  const router = useRouter();
  const params = useSearchParams();

  const urlTab = params.get("tab");
  const urlStatus = params.get("status");
  const urlSendStatus = params.get("send_status");
  const urlAudience = params.get("audience");

  const initialTab: "campaigns" | "reporting" =
    urlTab === "reporting" ? "reporting" : "campaigns";
  const [tab, setTabState] = useState<"campaigns" | "reporting">(initialTab);

  function setTab(t: "campaigns" | "reporting") {
    setTabState(t);
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (t === "campaigns") sp.delete("tab");
    else sp.set("tab", t);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  function setUrlParam(key: string, value: string | null) {
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (value === null || value === "") sp.delete(key);
    else sp.set(key, value);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const [pulse, setPulse] = useState<CampaignsStatusPulse>({
    activeCampaignsCount: 0,
    sendsThisWeekCount: 0,
    unsentCount: 0,
    expiringDiscountCodesCount: 0,
  });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [reporting, setReporting] = useState<ReportingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailSends, setDetailSends] = useState<CampaignSend[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"pause" | "activate" | null>(
    null
  );

  // ---- Data fetching ----

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [campRes, repRes, p] = await Promise.all([
        getCampaigns(),
        getCampaignReporting(),
        getCampaignsStatusPulse(),
      ]);
      if (campRes.error) throw new Error(campRes.error);
      if (repRes.error) throw new Error(repRes.error);
      setCampaigns(campRes.data ?? []);
      setReporting(repRes.data ?? null);
      setPulse(p);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function refreshPulse() {
    const p = await getCampaignsStatusPulse();
    setPulse(p);
  }

  // Filtered campaigns based on URL chips
  const filteredCampaigns = useMemo(() => {
    let list = campaigns;
    if (urlStatus) list = list.filter((c) => c.status === urlStatus);
    if (urlAudience) list = list.filter((c) => c.audience_type === urlAudience);
    return list;
  }, [campaigns, urlStatus, urlAudience]);

  // Bulk helpers
  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkUpdate(action: "pause" | "activate") {
    if (selectedIds.size === 0) return;
    setBulkAction(action);
    try {
      const newStatus = action === "pause" ? "paused" : "active";
      const ids = Array.from(selectedIds);
      const { data, error: err } = await bulkUpdateCampaignStatus(
        ids,
        newStatus
      );
      if (err) {
        toast.error(err);
        return;
      }
      const succeeded = data?.succeeded ?? 0;
      const failed = data?.failed.length ?? 0;
      if (failed > 0) {
        toast.warning(
          `${action === "pause" ? "Paused" : "Activated"} ${succeeded}, failed ${failed}.`
        );
      } else {
        toast.success(
          `${action === "pause" ? "Paused" : "Activated"} ${succeeded} campaign${
            succeeded === 1 ? "" : "s"
          }.`
        );
      }
      setSelectedIds(new Set());
      await loadData();
      void refreshPulse();
    } finally {
      setBulkAction(null);
    }
  }

  // ---- Actions ----

  async function handleToggleStatus(campaign: Campaign) {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    setTogglingId(campaign.id);
    const { error: err } = await updateCampaignStatus(campaign.id, newStatus);
    if (err) {
      toast.error("Could not update campaign status. Please try again.");
    } else {
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaign.id ? { ...c, status: newStatus } : c
        )
      );
      toast.success(`Campaign ${newStatus === "active" ? "activated" : "paused"}.`);
      void refreshPulse();
    }
    setTogglingId(null);
  }

  async function handleViewDetail(campaignId: string) {
    if (expandedId === campaignId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(campaignId);
    setDetailLoading(true);
    const { data } = await getCampaignDetail(campaignId);
    setDetailSends((data?.sends ?? []) as unknown as CampaignSend[]);
    setDetailLoading(false);
  }

  // ---- Derived values ----

  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const totalRecipients = campaigns.reduce(
    (sum, c) => sum + c.total_sends,
    0
  );
  const totalEngaged = campaigns.reduce(
    (sum, c) => sum + c.engaged_count,
    0
  );
  const overallRate =
    totalRecipients > 0 ? (totalEngaged / totalRecipients) * 100 : 0;

  // ---- Render ----

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-8 w-64 bg-gray-200 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-lg" />
          ))}
        </div>
        <div className="h-96 bg-gray-100 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CampaignsStatusPulseStrip pulse={pulse} basePath="/admin/campaigns" />

      {/* Header */}
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Re-engagement
        </p>
        <div className="flex items-center gap-3">
          <Megaphone className="h-7 w-7 text-[#E8712A]" />
          <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
            Campaign Management
          </h1>
        </div>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Manage re-engagement campaigns for dormant parents, declining centres,
          cold leads, and untrained coaches.
        </p>
      </div>

      {/* Jump filter chips */}
      {(urlStatus || urlSendStatus || urlAudience) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {urlStatus && (
            <FilterClearChip
              label={`Status: ${urlStatus}`}
              onClear={() => setUrlParam("status", null)}
            />
          )}
          {urlAudience && (
            <FilterClearChip
              label={`Audience: ${urlAudience}`}
              onClear={() => setUrlParam("audience", null)}
            />
          )}
          {urlSendStatus && (
            <FilterClearChip
              label={`Sends: ${urlSendStatus}`}
              onClear={() => setUrlParam("send_status", null)}
            />
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <SummaryCard label="Total Campaigns" icon={Megaphone}>
          <AnimatedMetric value={campaigns.length} />
        </SummaryCard>

        <SummaryCard label="Active Campaigns" iconNode={
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
        }>
          <AnimatedMetric value={activeCampaigns.length} />
        </SummaryCard>

        <SummaryCard label="Total Recipients" icon={Users}>
          <AnimatedMetric value={totalRecipients} />
        </SummaryCard>

        <SummaryCard label="Engagement Rate" icon={TrendingUp}>
          {pct(overallRate)}
        </SummaryCard>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b">
        <button
          onClick={() => setTab("campaigns")}
          className={`pb-2 text-sm font-medium transition-colors ${
            tab === "campaigns"
              ? "border-b-2 border-[#E8712A] text-[#1A1A1A]"
              : "text-[#666666] hover:text-[#1A1A1A]"
          }`}
        >
          All Campaigns
        </button>
        <button
          onClick={() => setTab("reporting")}
          className={`pb-2 text-sm font-medium transition-colors ${
            tab === "reporting"
              ? "border-b-2 border-[#E8712A] text-[#1A1A1A]"
              : "text-[#666666] hover:text-[#1A1A1A]"
          }`}
        >
          Reporting
        </button>
      </div>

      {/* Tab Content */}
      {tab === "campaigns" && (
        <CampaignsTab
          campaigns={filteredCampaigns}
          expandedId={expandedId}
          detailSends={detailSends}
          detailLoading={detailLoading}
          togglingId={togglingId}
          onToggleStatus={handleToggleStatus}
          onViewDetail={handleViewDetail}
          selectedIds={selectedIds}
          onToggleId={toggleId}
        />
      )}

      {tab === "reporting" && reporting && (
        <ReportingTab reporting={reporting} />
      )}

      {/* Sticky bulk-action bar */}
      {tab === "campaigns" && selectedIds.size > 0 && (
        <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-[#E8712A]/40 bg-background px-4 py-3 shadow-lg ring-1 ring-[#E8712A]/20 sm:bottom-6 sm:right-6">
          <div className="flex items-center gap-3 pr-2 text-sm">
            <span className="font-medium text-foreground">
              {selectedIds.size} campaign{selectedIds.size === 1 ? "" : "s"}{" "}
              selected
            </span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkUpdate("pause")}
            disabled={bulkAction !== null}
          >
            <Pause className="mr-1 h-3.5 w-3.5" />
            {bulkAction === "pause" ? "Pausing…" : "Pause"}
          </Button>
          <Button
            size="sm"
            onClick={() => handleBulkUpdate("activate")}
            disabled={bulkAction !== null}
            className="bg-[#E8712A] text-white hover:bg-[#d4641f]"
          >
            <Play className="mr-1 h-3.5 w-3.5" />
            {bulkAction === "activate" ? "Activating…" : "Activate"}
          </Button>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  icon: Icon,
  iconNode,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconNode?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
      <p className="text-xs font-medium uppercase tracking-wide text-[#666666]">
        {label}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {iconNode ?? (Icon && <Icon className="h-5 w-5 text-muted-foreground" />)}
        <span className="text-2xl font-bold tabular-nums text-[#1A1A1A]">
          {children}
        </span>
      </div>
    </div>
  );
}

function FilterClearChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2.5 py-1 text-xs font-medium text-[#E8712A]">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full p-0.5 hover:bg-[#E8712A]/20"
        aria-label="Clear filter"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// All Campaigns Tab
// ---------------------------------------------------------------------------

function CampaignsTab({
  campaigns,
  expandedId,
  detailSends,
  detailLoading,
  togglingId,
  onToggleStatus,
  onViewDetail,
  selectedIds,
  onToggleId,
}: {
  campaigns: Campaign[];
  expandedId: string | null;
  detailSends: CampaignSend[];
  detailLoading: boolean;
  togglingId: string | null;
  onToggleStatus: (c: Campaign) => void;
  onViewDetail: (id: string) => void;
  selectedIds: Set<string>;
  onToggleId: (id: string) => void;
}) {
  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Megaphone className="mx-auto h-10 w-10 mb-3 text-gray-300" />
          <p>No campaigns found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block">
        <div className="rounded-2xl border bg-background overflow-hidden hover:shadow-md transition">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium uppercase tracking-wide text-[#666666]">
                  <th className="w-[36px] px-4 py-3" />
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Audience</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Recipients</th>
                  <th className="px-4 py-3 text-right">Engaged</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const rate =
                    c.total_sends > 0
                      ? (c.engaged_count / c.total_sends) * 100
                      : 0;
                  const isExpanded = expandedId === c.id;

                  return (
                    <CampaignTableRows
                      key={c.id}
                      campaign={c}
                      rate={rate}
                      isExpanded={isExpanded}
                      detailSends={detailSends}
                      detailLoading={detailLoading}
                      togglingId={togglingId}
                      onToggleStatus={onToggleStatus}
                      onViewDetail={onViewDetail}
                      selected={selectedIds.has(c.id)}
                      onToggleSelect={() => onToggleId(c.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {campaigns.map((c) => {
          const rate =
            c.total_sends > 0
              ? (c.engaged_count / c.total_sends) * 100
              : 0;
          const isExpanded = expandedId === c.id;

          return (
            <Card key={c.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[#1A1A1A]">{c.name}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {audienceBadge(c.audience_type)}
                      {statusBadge(c.status)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-gray-50 p-2">
                    <p className="text-[#666666]">Recipients</p>
                    <p className="font-semibold text-[#1A1A1A]">
                      {c.total_sends}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2">
                    <p className="text-[#666666]">Engaged</p>
                    <p className="font-semibold text-[#1A1A1A]">
                      {c.engaged_count}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2">
                    <p className="text-[#666666]">Rate</p>
                    <p className="font-semibold text-[#1A1A1A]">{pct(rate)}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={togglingId === c.id}
                    onClick={() => onToggleStatus(c)}
                  >
                    {c.status === "active" ? (
                      <>
                        <Pause className="mr-1.5 h-3.5 w-3.5" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="mr-1.5 h-3.5 w-3.5" /> Resume
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onViewDetail(c.id)}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    {isExpanded ? "Hide" : "View"}
                  </Button>
                </div>

                {isExpanded && (
                  <DetailPanel
                    sends={detailSends}
                    loading={detailLoading}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Table row (with expandable detail)
// ---------------------------------------------------------------------------

function CampaignTableRows({
  campaign: c,
  rate,
  isExpanded,
  detailSends,
  detailLoading,
  togglingId,
  onToggleStatus,
  onViewDetail,
  selected,
  onToggleSelect,
}: {
  campaign: Campaign;
  rate: number;
  isExpanded: boolean;
  detailSends: CampaignSend[];
  detailLoading: boolean;
  togglingId: string | null;
  onToggleStatus: (c: Campaign) => void;
  onViewDetail: (id: string) => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <>
      <tr
        className="border-b last:border-0 hover:bg-gray-50/50 transition-colors"
        data-state={selected ? "selected" : undefined}
      >
        <td className="px-4 py-3">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            aria-label={`Select ${c.name}`}
          />
        </td>
        <td className="px-4 py-3 font-medium text-[#1A1A1A]">{c.name}</td>
        <td className="px-4 py-3">{audienceBadge(c.audience_type)}</td>
        <td className="px-4 py-3">{statusBadge(c.status)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{c.total_sends}</td>
        <td className="px-4 py-3 text-right tabular-nums">
          {c.engaged_count}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{pct(rate)}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={togglingId === c.id}
              onClick={() => onToggleStatus(c)}
            >
              {c.status === "active" ? (
                <>
                  <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                </>
              ) : (
                <>
                  <Play className="mr-1 h-3.5 w-3.5" /> Resume
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewDetail(c.id)}
            >
              {isExpanded ? (
                <ChevronUp className="mr-1 h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="mr-1 h-3.5 w-3.5" />
              )}
              View
            </Button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={8} className="bg-gray-50/80 px-4 py-4">
            <DetailPanel sends={detailSends} loading={detailLoading} />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail panel (recipients list)
// ---------------------------------------------------------------------------

function DetailPanel({
  sends,
  loading,
}: {
  sends: CampaignSend[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 rounded" />
        ))}
      </div>
    );
  }

  if (sends.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No recipients for this campaign yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#666666] mb-2">
        Recipients ({sends.length})
      </p>
      <div className="max-h-64 overflow-y-auto rounded border bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-[#666666]">
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Triggered</th>
              <th className="px-3 py-2">Engaged</th>
            </tr>
          </thead>
          <tbody>
            {sends.map((s) => (
              <tr
                key={s.id}
                className="border-b last:border-0 hover:bg-gray-50"
              >
                <td className="px-3 py-2 capitalize">{s.recipient_type}</td>
                <td className="px-3 py-2 text-[#666666]">
                  {s.trigger_reason}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    {SEND_STATUS_ICON[s.status] ?? null}
                    <span className="capitalize">{s.status}</span>
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {formatDate(s.triggered_at)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {s.engaged_at ? formatDate(s.engaged_at) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reporting Tab
// ---------------------------------------------------------------------------

function ReportingTab({ reporting }: { reporting: ReportingData }) {
  const metricCards = [
    {
      label: "Re-engagement Conversion",
      description: "Dormant parents who re-booked",
      rate:
        reporting.byAudienceType.find((a) => a.audienceType === "dormant_parents")
          ?.engagementRate ?? 0,
      colour: "bg-blue-500",
      bgLight: "bg-blue-100",
    },
    {
      label: "Centre Save Rate",
      description: "Declining centres that improved",
      rate:
        reporting.byAudienceType.find(
          (a) => a.audienceType === "declining_centres"
        )?.engagementRate ?? 0,
      colour: "bg-amber-500",
      bgLight: "bg-amber-100",
    },
    {
      label: "Lead Recovery Rate",
      description: "Cold leads that progressed",
      rate:
        reporting.byAudienceType.find((a) => a.audienceType === "cold_leads")
          ?.engagementRate ?? 0,
      colour: "bg-purple-500",
      bgLight: "bg-purple-100",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Overall stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-[#666666]">
              Total Sends
            </p>
            <p className="mt-1 text-3xl font-bold text-[#1A1A1A]">
              {reporting.totals.totalSends.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-[#666666]">
              Total Engaged
            </p>
            <p className="mt-1 text-3xl font-bold text-[#1A1A1A]">
              {reporting.totals.totalEngaged.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-[#666666]">
              Overall Rate
            </p>
            <p className="mt-1 text-3xl font-bold text-[#E8712A]">
              {pct(reporting.totals.overallEngagementRate)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Engagement by audience type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Engagement by Audience Type
          </CardTitle>
          <CardDescription>
            Breakdown of campaign performance across audience segments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {reporting.byAudienceType.map((a) => {
            const cfg = AUDIENCE_CONFIG[a.audienceType];
            const barColour =
              {
                dormant_parents: "bg-blue-500",
                declining_centres: "bg-amber-500",
                cold_leads: "bg-purple-500",
                untrained_coaches: "bg-orange-500",
              }[a.audienceType] ?? "bg-gray-500";

            return (
              <div key={a.audienceType}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-[#1A1A1A]">
                    {cfg?.label ?? a.audienceType}
                  </span>
                  <span className="text-sm tabular-nums text-[#666666]">
                    {a.totalEngaged}/{a.totalSends} &middot; {pct(a.engagementRate)}
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColour} transition-all duration-500`}
                    style={{ width: `${Math.min(a.engagementRate, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {metricCards.map((m) => (
          <Card key={m.label}>
            <CardContent className="pt-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-[#1A1A1A]">
                  {m.label}
                </p>
                <p className="text-xs text-[#666666]">{m.description}</p>
              </div>
              <div className="flex items-end gap-3">
                <span className="text-2xl font-bold text-[#1A1A1A]">
                  {pct(m.rate)}
                </span>
                <div className="flex-1">
                  <div
                    className={`h-2.5 w-full rounded-full ${m.bgLight} overflow-hidden`}
                  >
                    <div
                      className={`h-full rounded-full ${m.colour} transition-all duration-500`}
                      style={{ width: `${Math.min(m.rate, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
