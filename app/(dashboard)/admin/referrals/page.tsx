"use client";

import { useEffect, useState } from "react";
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
} from "@/lib/referrals/actions";

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

export default function AdminReferralsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Parent Referrals");
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
      const [dashResult, configResult] = await Promise.all([
        getAdminReferralDashboard(),
        getAdminReferralConfig(),
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
        if ((d as any).recentRewards) {
          setRewards((d as any).recentRewards as unknown as Reward[]);
        }
      }

      if (configResult.data) {
        setConfig(configResult.data);
      }

      setLoading(false);
    }
    load();
  }, []);

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
    if (!result.error) {
      setConfig((prev) =>
        prev.map((c) =>
          c.config_key === key
            ? { ...c, config_value: parsed, updated_at: new Date().toISOString() }
            : c
        )
      );
      setEditingConfig(null);
    }
    setSavingConfig(false);
  }

  async function handleGenerateCodes() {
    setGeneratingCodes(true);
    const result = await generateCentreReferralCodes();
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="h-4 w-4 text-[#E8712A]" />
              <span className="text-xs font-medium text-[#666666]">
                Active Codes
              </span>
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A]">
              {stats.activeCodes}
            </p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-[#E8712A]" />
              <span className="text-xs font-medium text-[#666666]">
                Total Referrals
              </span>
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A]">
              {stats.totalReferrals}
            </p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-[#E8712A]" />
              <span className="text-xs font-medium text-[#666666]">
                Conversion Rate
              </span>
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A]">
              {stats.conversionRate.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="h-4 w-4 text-[#E8712A]" />
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
        <div className="rounded-xl border border-orange-100 bg-white shadow-sm overflow-hidden">
          {parentReferrals.length === 0 ? (
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
                  {parentReferrals.map((ref) => (
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
        <div className="rounded-xl border border-orange-100 bg-white shadow-sm overflow-hidden">
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
        <div className="rounded-xl border border-orange-100 bg-white shadow-sm overflow-hidden">
          {rewards.length === 0 ? (
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
                  {rewards.map((reward) => (
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
              className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm"
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
            <div className="rounded-xl border border-orange-100 bg-white p-8 shadow-sm text-center">
              <p className="text-[#666666] text-sm">
                No configuration items found
              </p>
            </div>
          )}

          {/* Generate Centre Codes */}
          <div className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
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
