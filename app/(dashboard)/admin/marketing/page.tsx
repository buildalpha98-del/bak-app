"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquareQuote,
  Code2,
  BarChart3,
  RefreshCw,
  ExternalLink,
  Users,
  Trophy,
  Star,
  Calendar,
  Baby,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PublicStats {
  sessions_all_time: number;
  sessions_this_term: number;
  centre_count: number;
  sport_count: number;
  average_rating: number;
  children_count: number;
  last_calculated: string | null;
}

const STAT_CONFIG: {
  key: keyof Omit<PublicStats, "last_calculated">;
  label: string;
  icon: React.ReactNode;
  format: (v: number) => string;
}[] = [
  {
    key: "sessions_all_time",
    label: "Total Sessions (All Time)",
    icon: <Calendar className="h-5 w-5 text-[#E8712A]" />,
    format: (v) => v.toLocaleString(),
  },
  {
    key: "sessions_this_term",
    label: "Sessions This Term",
    icon: <Activity className="h-5 w-5 text-[#E8712A]" />,
    format: (v) => v.toLocaleString(),
  },
  {
    key: "centre_count",
    label: "Active Centres",
    icon: <Users className="h-5 w-5 text-[#E8712A]" />,
    format: (v) => v.toLocaleString(),
  },
  {
    key: "sport_count",
    label: "Sports Offered",
    icon: <Trophy className="h-5 w-5 text-[#E8712A]" />,
    format: (v) => v.toLocaleString(),
  },
  {
    key: "average_rating",
    label: "Average Rating",
    icon: <Star className="h-5 w-5 text-[#E8712A]" />,
    format: (v) => (v ? `${v.toFixed(1)} / 5` : "N/A"),
  },
  {
    key: "children_count",
    label: "Active Children",
    icon: <Baby className="h-5 w-5 text-[#E8712A]" />,
    format: (v) => v.toLocaleString(),
  },
];

type Tab = "testimonials" | "widgets" | "stats";

export default function AdminMarketingPage() {
  const [activeTab, setActiveTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    try {
      const res = await fetch("/api/public/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/public/refresh-stats", {
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}`,
        },
      });
      if (res.ok) {
        // Re-fetch after refresh
        await fetchStats();
      }
    } catch (err) {
      console.error("Failed to refresh stats:", err);
    } finally {
      setRefreshing(false);
    }
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "stats", label: "Stats", icon: <BarChart3 className="h-4 w-4" /> },
    {
      key: "testimonials",
      label: "Testimonials",
      icon: <MessageSquareQuote className="h-4 w-4" />,
    },
    { key: "widgets", label: "Widgets", icon: <Code2 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Marketing</h1>
        <p className="text-sm text-[#666666]">
          Manage public-facing content, testimonials, and embeddable widgets.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-[#F5F5F5] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white text-[#1A1A1A] shadow-sm"
                : "text-[#666666] hover:text-[#1A1A1A]"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "stats" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#1A1A1A]">
                Cached Public Stats
              </h2>
              {stats?.last_calculated && (
                <p className="text-xs text-[#666666]">
                  Last calculated:{" "}
                  {new Date(stats.last_calculated).toLocaleString("en-AU", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              )}
            </div>
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              {refreshing ? "Refreshing..." : "Refresh Now"}
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-xl bg-[#F5F5F5]"
                />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STAT_CONFIG.map((cfg) => (
                <div
                  key={cfg.key}
                  className="flex items-center gap-4 rounded-xl border bg-white p-5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
                    {cfg.icon}
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[#1A1A1A]">
                      {cfg.format(stats[cfg.key] as number)}
                    </p>
                    <p className="text-xs text-[#666666]">{cfg.label}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#666666]">
              No stats cached yet. Click &quot;Refresh Now&quot; to calculate.
            </p>
          )}
        </div>
      )}

      {activeTab === "testimonials" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#1A1A1A]">
                Testimonials
              </h2>
              <p className="text-sm text-[#666666]">
                Review and approve centre feedback for public display.
              </p>
            </div>
            <Link href="/admin/marketing/testimonials">
              <Button variant="outline" size="sm" className="gap-2">
                Manage Testimonials
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="rounded-xl border bg-white p-8 text-center">
            <MessageSquareQuote className="mx-auto h-12 w-12 text-[#E8712A] opacity-50" />
            <p className="mt-3 text-sm text-[#666666]">
              Review pending feedback and approve testimonials for your marketing
              website.
            </p>
            <Link href="/admin/marketing/testimonials">
              <Button className="mt-4 bg-[#E8712A] hover:bg-[#d4641f]">
                Go to Testimonials
              </Button>
            </Link>
          </div>
        </div>
      )}

      {activeTab === "widgets" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#1A1A1A]">
                Embeddable Widgets
              </h2>
              <p className="text-sm text-[#666666]">
                Copy-paste widget code for your marketing website.
              </p>
            </div>
            <Link href="/admin/marketing/widgets">
              <Button variant="outline" size="sm" className="gap-2">
                View All Widgets
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {["Stats Bar", "Sports Grid", "Testimonial Carousel", "Enquiry Form"].map(
              (widget) => (
                <div
                  key={widget}
                  className="rounded-xl border bg-white p-5"
                >
                  <div className="flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-[#E8712A]" />
                    <p className="font-medium text-[#1A1A1A]">{widget}</p>
                  </div>
                  <p className="mt-1 text-xs text-[#666666]">
                    Embeddable {widget.toLowerCase()} widget
                  </p>
                  <Badge variant="outline" className="mt-2">
                    Ready to embed
                  </Badge>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
