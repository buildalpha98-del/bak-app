"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Link2,
  Users,
  TrendingUp,
  Gift,
  RefreshCw,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getAdminReferralDashboard,
  getAdminReferralConfig,
  updateReferralConfig,
  generateCentreReferralCodes,
  type ReferralReward,
} from "@/lib/referrals/actions";
import { getReferralsStatusPulse } from "@/lib/referrals/status-pulse-actions";
import type { ReferralsStatusPulse } from "@/lib/referrals/status-pulse-actions";
import { ReferralsStatusPulseStrip } from "@/components/referrals/referrals-status-pulse";
import { useCountUp } from "@/components/launch/use-count-up";

type DashboardStats = {
  activeCodes: number;
  totalReferrals: number;
  totalConversions: number;
  conversionRate: number;
  totalRewardsAwarded: number;
};

type ParentReferral = {
  id: string;
  referrer_name: string;
  referred_email: string;
  status: string;
  conversion_date: string | null;
  created_at: string;
};

type CentreReferral = {
  id: string;
  referring_centre: string;
  referred_entity: string;
  status: string;
  created_at: string;
};

type Reward = {
  id: string;
  reward_type: string;
  recipient_name: string;
  status: string;
  reward_value_cents: number;
  awarded_at: string;
};

type ConfigItem = {
  id: string;
  config_key: string;
  config_value: Record<string, unknown>;
  updated_at: string;
};

const TABS = [
  "Parent Referrals",
  "Centre Referrals",
  "Rewards",
  "Configuration",
] as const;
type Tab = (typeof TABS)[number];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    sent: "bg-blue-50 text-blue-700 border-blue-200",
    registered: "bg-green-50 text-green-700 border-green-200",
    converted: "bg-[#E8712A]/10 text-[#E8712A] border-[#E8712A]/20",
    awarded: "bg-green-100 text-green-800 border-green-200",
    redeemed: "bg-blue-100 text-blue-800 border-blue-200",
    expired: "bg-gray-100 text-gray-500 border-gray-200",
    active: "bg-green-100 text-green-800 border-green-200",
    lost: "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <Badge
      variant="outline"
      className={styles[status] ?? "bg-gray-100 text-gray-600 border-gray-200"}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function formatConfigLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function CountTile({
  label,
  value,
  suffix,
  icon: Icon,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const ticked = useCountUp(value);
  return (
    <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-[#666666]">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-[#1A1A1A]">
        {ticked}
        {suffix}
      </p>
    </div>
  );
}

export default function AdminReferralsPage() {
  const router = useRouter();
  const params = useSearchParams();

  const urlTab = params.get("tab");
  const initialTab: Tab = (TABS as readonly string[]).includes(urlTab ?? "")
    ? (urlTab as Tab)
    : "Parent Referrals";
  const [activeTab, setActiveTabState] = useState<Tab>(initialTab);

  function setActiveTab(t: Tab) {
    setActiveTabState(t);
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (t === "Parent Referrals") sp.delete("tab");
    else sp.set("tab", t);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  useEffect(() => {
    if ((TABS as readonly string[]).includes(urlTab ?? "")) {
      setActiveTabState(urlTab as Tab);
    }
  }, [urlTab]);

  // Filter chips
  const rangeFilter = params.get("range"); // "this_week" jump
  const rewardStatusFilter = params.get("status"); // pending | awarded | redeemed

  function clearJumpFilter(key: string) {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.delete(key);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const [pulse, setPulse] = useState<ReferralsStatusPulse>({
    activeCodesCount: 0,
    conversionsThisWeekCount: 0,
    pendingRewardsCount: 0,
    configDriftCount: 0,
  });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [parentReferrals, setParentReferrals] = useState<ParentReferral[]>([]);
  const [centreReferrals, setCentreReferrals] = useState<CentreReferral[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [config, setConfig] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [generatingCodes, setGeneratingCodes] = useState(false);

  useEffect(() => {
    async function load() {
      const [dashResult, configResult, pulseRes] = await Promise.all([
        getAdminReferralDashboard(),
        getAdminReferralConfig(),
        getReferralsStatusPulse(),
      ]);

      if (dashResult.error) {
        setError(dashResult.error);
      } else if (dashResult.data) {
        const d = dashResult.data;
        setStats({
          activeCodes: d.activeCodes,
          totalReferrals: d.totalReferrals,
          totalConversions: d.totalConversions,
          conversionRate: d.conversionRate,
          totalRewardsAwarded: d.totalRewardsAwarded,
        });
        setParentReferrals(d.recentParentReferrals as unknown as ParentReferral[]);
        setCentreReferrals(d.recentCentreReferrals as unknown as CentreReferral[]);
        if ((d as { recentRewards?: unknown }).recentRewards) {
          setRewards(
            (d as { recentRewards: ReferralReward[] })
              .recentRewards as unknown as Reward[]
          );
        }
      }

      if (configResult.data) {
        setConfig(configResult.data);
      }

      setPulse(pulseRes);

      setLoading(false);
    }
    load();
  }, []);

  // Derived filtered lists
  const filteredParentReferrals = useMemo(() => {
    let list = parentReferrals;
    if (rangeFilter === "this_week") {
      // Approximate: keep created in last 7 days
      const monday = new Date();
      monday.setDate(monday.getDate() - monday.getDay() || -6);
      monday.setHours(0, 0, 0, 0);
      const mondayIso = monday.toISOString();
      list = list.filter((r) => r.created_at >= mondayIso);
    }
    return list;
  }, [parentReferrals, rangeFilter]);

  const filteredRewards = useMemo(() => {
    let list = rewards;
    if (rewardStatusFilter) {
      list = list.filter((r) => r.status === rewardStatusFilter);
    }
    return list;
  }, [rewards, rewardStatusFilter]);

  async function handleSaveConfig(key: string) {
    setSavingConfig(true);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editValue);
    } catch {
      setSavingConfig(false);
      return;
    }
    const result = await updateReferralConfig(key, parsed);
    if (result.error) {
      toast.error("Could not save referral config. Please try again.");
    } else {
      setConfig((prev) =>
        prev.map((c) =>
          c.config_key === key
            ? { ...c, config_value: parsed, updated_at: new Date().toISOString() }
            : c
        )
      );
      setEditingConfig(null);
      toast.success("Referral config updated.");
    }
    setSavingConfig(false);
  }

  async function handleGenerateCodes() {
    setGeneratingCodes(true);
    const result = await generateCentreReferralCodes();
    if (result.error) {
      toast.error("Could not generate referral codes. Please try again.");
      setGeneratingCodes(false);
      return;
    }
    toast.success("Centre referral codes generated.");
    if (result.data) {
      // Reload dashboard data
      const dashResult = await getAdminReferralDashboard();
      if (dashResult.data) {
        const d = dashResult.data;
        setStats({
          activeCodes: d.activeCodes,
          totalReferrals: d.totalReferrals,
          totalConversions: d.totalConversions,
          conversionRate: d.conversionRate,
          totalRewardsAwarded: d.totalRewardsAwarded,
        });
        setCentreReferrals(d.recentCentreReferrals as unknown as CentreReferral[]);
      }
    }
    setGeneratingCodes(false);
  }

  if (loading) {
    return (
      <div className="space-y-4 pb-8">
        <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />
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
    <div className="space-y-6 pb-8">
      <ReferralsStatusPulseStrip pulse={pulse} basePath="/admin/referrals" />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">
          Referral Management
        </h1>
        <p className="text-sm text-[#666666] mt-1">
          Track referrals, rewards, and manage programme configuration
        </p>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <CountTile
            label="Active Codes"
            value={stats.activeCodes}
            icon={Link2}
          />
          <CountTile
            label="Total Referrals"
            value={stats.totalReferrals}
            icon={Users}
          />
          <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-[#666666]">
                Conversion Rate
              </span>
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A]">
              {stats.conversionRate.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-[#666666]">
                Rewards Awarded
              </span>
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A]">
              {stats.totalRewardsAwarded}
            </p>
            <p className="text-xs text-[#666666] mt-0.5">
              {stats.totalConversions} conversions
            </p>
          </div>
        </div>
      )}

      {/* Jump-filter chips */}
      {(rangeFilter === "this_week" || rewardStatusFilter) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {rangeFilter === "this_week" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2.5 py-1 text-xs font-medium text-[#E8712A]">
              This week
              <button
                type="button"
                onClick={() => clearJumpFilter("range")}
                className="ml-1 rounded-full p-0.5 hover:bg-[#E8712A]/20"
                aria-label="Clear range filter"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {rewardStatusFilter && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2.5 py-1 text-xs font-medium text-[#E8712A]">
              Status: {rewardStatusFilter}
              <button
                type="button"
                onClick={() => clearJumpFilter("status")}
                className="ml-1 rounded-full p-0.5 hover:bg-[#E8712A]/20"
                aria-label="Clear status filter"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-[#E8712A] text-[#E8712A]"
                  : "text-[#666666] hover:text-[#1A1A1A]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "Parent Referrals" && (
        <div className="rounded-2xl border bg-background overflow-hidden hover:shadow-md transition">
          {filteredParentReferrals.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="h-10 w-10 text-orange-200 mx-auto mb-3" />
              <p className="text-[#1A1A1A] font-medium">
                No parent referrals yet
              </p>
              <p className="text-sm text-[#666666] mt-1">
                Referrals will appear here once parents share their codes
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Referrer
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Referred Email
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Date
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Conversion
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParentReferrals.map((ref) => (
                    <tr
                      key={ref.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50"
                    >
                      <td className="px-4 py-3 font-medium text-[#1A1A1A]">
                        {ref.referrer_name}
                      </td>
                      <td className="px-4 py-3 text-[#666666]">
                        {ref.referred_email}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(ref.status)}</td>
                      <td className="px-4 py-3 text-[#666666]">
                        {formatDate(ref.created_at)}
                      </td>
                      <td className="px-4 py-3 text-[#666666]">
                        {ref.conversion_date
                          ? formatDate(ref.conversion_date)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "Centre Referrals" && (
        <div className="rounded-2xl border bg-background overflow-hidden hover:shadow-md transition">
          {centreReferrals.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="h-10 w-10 text-orange-200 mx-auto mb-3" />
              <p className="text-[#1A1A1A] font-medium">
                No centre referrals yet
              </p>
              <p className="text-sm text-[#666666] mt-1">
                Centre-to-centre referrals will appear here
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Referring Centre
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Referred Entity
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {centreReferrals.map((ref) => (
                    <tr
                      key={ref.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50"
                    >
                      <td className="px-4 py-3 font-medium text-[#1A1A1A]">
                        {ref.referring_centre}
                      </td>
                      <td className="px-4 py-3 text-[#666666]">
                        {ref.referred_entity}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(ref.status)}</td>
                      <td className="px-4 py-3 text-[#666666]">
                        {formatDate(ref.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "Rewards" && (
        <div className="rounded-2xl border bg-background overflow-hidden hover:shadow-md transition">
          {filteredRewards.length === 0 ? (
            <div className="p-8 text-center">
              <Gift className="h-10 w-10 text-orange-200 mx-auto mb-3" />
              <p className="text-[#1A1A1A] font-medium">No rewards yet</p>
              <p className="text-sm text-[#666666] mt-1">
                Rewards will appear here as referrals convert
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Type
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Recipient
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Value
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-[#666666]">
                      Awarded
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRewards.map((reward) => (
                    <tr
                      key={reward.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50"
                    >
                      <td className="px-4 py-3 font-medium text-[#1A1A1A] capitalize">
                        {reward.reward_type.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 text-[#666666]">
                        {reward.recipient_name}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(reward.status)}
                      </td>
                      <td className="px-4 py-3 text-[#666666]">
                        ${(reward.reward_value_cents / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-[#666666]">
                        {formatDate(reward.awarded_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "Configuration" && (
        <div className="space-y-4">
          {config.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border bg-background p-5 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[#1A1A1A] text-sm">
                    {formatConfigLabel(item.config_key)}
                  </p>
                  <p className="text-xs text-[#666666] mt-0.5">
                    Last updated: {formatDate(item.updated_at)}
                  </p>
                </div>

                {editingConfig === item.config_key ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-[#E8712A]/30 focus:border-[#E8712A]"
                    />
                    <button
                      onClick={() => handleSaveConfig(item.config_key)}
                      disabled={savingConfig}
                      className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      {savingConfig ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setEditingConfig(null)}
                      className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-[#1A1A1A] bg-gray-50 px-3 py-1.5 rounded-lg max-w-xs truncate">
                      {JSON.stringify(item.config_value)}
                    </span>
                    <button
                      onClick={() => {
                        setEditingConfig(item.config_key);
                        setEditValue(JSON.stringify(item.config_value, null, 2));
                      }}
                      className="p-1.5 rounded-lg text-[#666666] hover:bg-gray-100 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {config.length === 0 && (
            <div className="rounded-2xl border bg-background p-8 text-center hover:shadow-md transition">
              <p className="text-[#666666] text-sm">
                No configuration items found
              </p>
            </div>
          )}

          {/* Generate Centre Codes */}
          <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-[#1A1A1A] text-sm">
                  Generate Centre Referral Codes
                </p>
                <p className="text-xs text-[#666666] mt-0.5">
                  Create referral codes for all centres that don&apos;t have one
                  yet
                </p>
              </div>
              <Button
                onClick={handleGenerateCodes}
                disabled={generatingCodes}
                className="bg-[#E8712A] hover:bg-[#d4651f] text-white min-h-[44px]"
              >
                {generatingCodes ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1.5" />
                    Generate Codes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
