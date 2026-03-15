"use client";

import { useEffect, useState } from "react";
import {
  Gift,
  Copy,
  Mail,
  MessageSquare,
  Check,
  Users,
  UserCheck,
  Trophy,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getParentReferralData } from "@/lib/referrals/actions";

type ReferralCode = { id: string; code: string };
type Referral = {
  id: string;
  referred_email: string;
  status: string;
  created_at: string;
};
type Reward = {
  id: string;
  reward_type: string;
  reward_value_cents: number | null;
  reward_description: string;
  status: string;
  awarded_at: string;
  redeemed_at: string | null;
};
type MilestoneProgress = {
  currentConversions: number;
  requiredConversions: number;
  rewardDescription: string;
  reached: boolean;
};
type Stats = {
  totalReferrals: number;
  registeredCount: number;
  convertedCount: number;
};

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

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
    awarded: "bg-green-100 text-green-800 border-green-200",
    redeemed: "bg-blue-100 text-blue-800 border-blue-200",
    expired: "bg-gray-100 text-gray-500 border-gray-200",
    sent: "bg-blue-50 text-blue-700 border-blue-200",
    registered: "bg-green-50 text-green-700 border-green-200",
    converted: "bg-[#E8712A]/10 text-[#E8712A] border-[#E8712A]/20",
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

export default function ParentReferralsPage() {
  const [code, setCode] = useState<ReferralCode | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [milestone, setMilestone] = useState<MilestoneProgress>({
    currentConversions: 0,
    requiredConversions: 5,
    rewardDescription: "Free session",
    reached: false,
  });
  const [stats, setStats] = useState<Stats>({
    totalReferrals: 0,
    registeredCount: 0,
    convertedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const result = await getParentReferralData();
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setCode(result.data.code);
        setReferrals(result.data.referrals);
        setRewards(result.data.rewards);
        if (result.data.milestoneProgress) setMilestone(result.data.milestoneProgress);
        setStats(result.data.stats);
      }
      setLoading(false);
    }
    load();
  }, []);

  const shareLink = code
    ? `https://app.buildalphakids.com.au/refer/${code.code}`
    : "";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback - do nothing
    }
  }

  function handleEmailShare() {
    const subject = encodeURIComponent("Join Build Alpha Kids!");
    const body = encodeURIComponent(
      `Hey! I thought you'd love Build Alpha Kids for your little ones. They run amazing multi-sport programs.\n\nSign up using my referral link and we both get rewarded:\n${shareLink}\n\nSee you there!`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
  }

  function handleSmsShare() {
    const body = encodeURIComponent(
      `Hey! Check out Build Alpha Kids for your kids - amazing multi-sport programs! Sign up with my link: ${shareLink}`
    );
    window.open(`sms:?body=${body}`, "_self");
  }

  if (loading) {
    return (
      <div className="space-y-4 pb-8">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
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

  const availableRewards = rewards.filter(
    (r) => r.status === "awarded" && !r.redeemed_at
  );
  const milestoneReached = milestone.reached;
  const progressPct =
    milestone.requiredConversions > 0
      ? Math.min(100, Math.round((milestone.currentConversions / milestone.requiredConversions) * 100))
      : 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-[#E8712A]">
          <Gift className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Refer a Friend</h1>
          <p className="text-sm text-[#666666]">
            Share the love and earn rewards
          </p>
        </div>
      </div>

      {/* Referral Code Card */}
      {code && (
        <div className="rounded-xl border border-orange-100 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-[#666666] mb-2">
            Your referral code
          </p>
          <p className="text-3xl font-bold font-mono text-[#1A1A1A] tracking-wider mb-1">
            {code.code}
          </p>
          <p className="text-xs text-[#666666] mb-5 break-all">{shareLink}</p>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleCopy}
              className={`min-h-[44px] text-sm ${
                copied
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-[#E8712A] hover:bg-[#d4651f]"
              } text-white`}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1.5" />
                  Copy Link
                </>
              )}
            </Button>
            <Button
              onClick={handleEmailShare}
              variant="outline"
              className="min-h-[44px] text-sm border-[#E8712A] text-[#E8712A] hover:bg-orange-50"
            >
              <Mail className="h-4 w-4 mr-1.5" />
              Share via Email
            </Button>
            <Button
              onClick={handleSmsShare}
              variant="outline"
              className="min-h-[44px] text-sm border-[#E8712A] text-[#E8712A] hover:bg-orange-50"
            >
              <MessageSquare className="h-4 w-4 mr-1.5" />
              Share via SMS
            </Button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-orange-100 bg-white p-4 shadow-sm text-center">
          <div className="flex justify-center mb-2">
            <Users className="h-5 w-5 text-[#E8712A]" />
          </div>
          <p className="text-2xl font-bold text-[#1A1A1A]">
            {stats.totalReferrals}
          </p>
          <p className="text-xs text-[#666666] mt-1">Referred</p>
        </div>
        <div className="rounded-xl border border-orange-100 bg-white p-4 shadow-sm text-center">
          <div className="flex justify-center mb-2">
            <UserCheck className="h-5 w-5 text-[#E8712A]" />
          </div>
          <p className="text-2xl font-bold text-[#1A1A1A]">
            {stats.registeredCount}
          </p>
          <p className="text-xs text-[#666666] mt-1">Registered</p>
        </div>
        <div className="rounded-xl border border-orange-100 bg-white p-4 shadow-sm text-center">
          <div className="flex justify-center mb-2">
            <Trophy className="h-5 w-5 text-[#E8712A]" />
          </div>
          <p className="text-2xl font-bold text-[#1A1A1A]">
            {stats.convertedCount}
          </p>
          <p className="text-xs text-[#666666] mt-1">Converted</p>
        </div>
      </div>

      {/* Milestone Progress */}
      <div className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">
          Milestone Progress
        </h2>
        <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all ${
              milestoneReached ? "bg-green-500" : "bg-[#E8712A]"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {milestoneReached ? (
          <p className="text-sm font-semibold text-green-600">
            You&apos;ve earned a {milestone.rewardDescription.toLowerCase()}!
          </p>
        ) : (
          <p className="text-sm text-[#666666]">
            {milestone.currentConversions} of {milestone.requiredConversions} referrals for a{" "}
            {milestone.rewardDescription.toLowerCase()}!
          </p>
        )}
      </div>

      {/* Available Rewards */}
      {availableRewards.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">
            Available Rewards
          </h2>
          {availableRewards.map((reward) => (
            <div
              key={reward.id}
              className="rounded-xl border-2 border-[#E8712A] bg-orange-50 p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[#1A1A1A]">
                    {reward.reward_description}
                  </p>
                  <p className="text-sm text-[#666666] mt-1">
                    Value: $
                    {((reward.reward_value_cents ?? 0) / 100).toFixed(2)}
                  </p>
                </div>
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  Ready to Redeem
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reward History */}
      {rewards.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">
            Reward History
          </h2>
          <div className="space-y-2">
            {rewards.map((reward) => (
              <div
                key={reward.id}
                className="rounded-xl border border-orange-100 bg-white p-4 shadow-sm flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-[#1A1A1A] truncate">
                    {reward.reward_description}
                  </p>
                  <p className="text-xs text-[#666666] mt-0.5">
                    ${((reward.reward_value_cents ?? 0) / 100).toFixed(2)} &middot;{" "}
                    {formatDate(reward.awarded_at)}
                  </p>
                </div>
                {getStatusBadge(reward.status)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Referral List */}
      {referrals.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">
            Your Referrals
          </h2>
          <div className="space-y-2">
            {referrals.map((referral) => (
              <div
                key={referral.id}
                className="rounded-xl border border-orange-100 bg-white p-4 shadow-sm flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-[#1A1A1A]">
                    {maskEmail(referral.referred_email)}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-[#666666] mt-0.5">
                    <Clock className="h-3 w-3" />
                    {formatDate(referral.created_at)}
                  </div>
                </div>
                {getStatusBadge(referral.status)}
              </div>
            ))}
          </div>
        </div>
      )}

      {referrals.length === 0 && (
        <div className="rounded-xl border border-orange-100 bg-white p-8 shadow-sm text-center">
          <Gift className="h-10 w-10 text-orange-200 mx-auto mb-3" />
          <p className="text-[#1A1A1A] font-medium">No referrals yet</p>
          <p className="text-sm text-[#666666] mt-1">
            Share your code with friends to start earning rewards!
          </p>
        </div>
      )}
    </div>
  );
}
