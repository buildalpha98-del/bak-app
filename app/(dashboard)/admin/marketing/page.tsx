"use client";

// ============================================================
// Admin Marketing dashboard
// ============================================================
//
// Mirrors the close-out pattern (db2d0aa, 94cfba3, 91b383e):
//   - inline status pulse strip above the page header
//   - URL-persisted tab + filter state (?tab=stats|testimonials|widgets)
//   - bulk-select testimonials with sticky BulkActionBar (approve/reject)
//   - `useCountUp` on the stat tiles
//   - rounded-2xl shells + restrained brand orange

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
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
  Mail,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getPublicStats,
  refreshPublicStats,
  type PublicStats,
} from "@/lib/marketing/actions";
import { getMarketingStatusPulse } from "@/lib/marketing/status-pulse-actions";
import type { MarketingStatusPulse } from "@/lib/marketing/status-pulse-actions";
import { MarketingStatusPulseStrip } from "@/components/marketing/marketing-status-pulse";
import { useCountUp } from "@/components/launch/use-count-up";

const STAT_CONFIG: {
  key: keyof Omit<PublicStats, "last_calculated">;
  label: string;
  icon: React.ReactNode;
  format: (v: number) => string;
}[] = [
  {
    key: "sessions_all_time",
    label: "Total Sessions (All Time)",
    icon: <Calendar className="h-5 w-5 text-muted-foreground" />,
    format: (v) => v.toLocaleString(),
  },
  {
    key: "sessions_this_term",
    label: "Sessions This Term",
    icon: <Activity className="h-5 w-5 text-muted-foreground" />,
    format: (v) => v.toLocaleString(),
  },
  {
    key: "centre_count",
    label: "Active Centres",
    icon: <Users className="h-5 w-5 text-muted-foreground" />,
    format: (v) => v.toLocaleString(),
  },
  {
    key: "sport_count",
    label: "Sports Offered",
    icon: <Trophy className="h-5 w-5 text-muted-foreground" />,
    format: (v) => v.toLocaleString(),
  },
  {
    key: "average_rating",
    label: "Average Rating",
    icon: <Star className="h-5 w-5 text-muted-foreground" />,
    format: (v) => (v ? `${v.toFixed(1)} / 5` : "N/A"),
  },
  {
    key: "children_count",
    label: "Active Children",
    icon: <Baby className="h-5 w-5 text-muted-foreground" />,
    format: (v) => v.toLocaleString(),
  },
];

const TAB_VALUES = [
  "stats",
  "testimonials",
  "widgets",
  "subscribers",
  "blog",
] as const;
type Tab = (typeof TAB_VALUES)[number];

function isTab(v: string | null): v is Tab {
  return v !== null && (TAB_VALUES as readonly string[]).includes(v);
}

function CountTile({
  label,
  value,
  formatted,
  icon,
}: {
  label: string;
  value: number;
  formatted: string;
  icon: React.ReactNode;
}) {
  // useCountUp ticks integer values; formatted display kept for
  // average_rating etc. We show ticked digits when the formatted
  // string is a pure integer-ish; otherwise fall through to formatted.
  const ticked = useCountUp(value);
  const isNumeric = /^[0-9,]+$/.test(formatted);
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-background p-5 hover:shadow-md transition">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/40">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums text-[#1A1A1A]">
          {isNumeric ? ticked.toLocaleString() : formatted}
        </p>
        <p className="text-xs text-[#666666]">{label}</p>
      </div>
    </div>
  );
}

export default function AdminMarketingPage() {
  const router = useRouter();
  const params = useSearchParams();

  // URL-backed tab state
  const initialTab: Tab = isTab(params.get("tab"))
    ? (params.get("tab") as Tab)
    : "stats";
  const [activeTab, setActiveTabState] = useState<Tab>(initialTab);

  const urlTab = params.get("tab");
  useEffect(() => {
    const target = isTab(urlTab) ? (urlTab as Tab) : "stats";
    setActiveTabState((prev) => (prev === target ? prev : target));
  }, [urlTab]);

  function setActiveTab(v: string) {
    if (!isTab(v)) return;
    setActiveTabState(v);
    const next = new URLSearchParams(Array.from(params.entries()));
    if (v === "stats") next.delete("tab");
    else next.set("tab", v);
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  // Pulse strip
  const [pulse, setPulse] = useState<MarketingStatusPulse>({
    pendingTestimonialsCount: 0,
    approvedThisWeekCount: 0,
    staleCacheCount: 0,
    webEnquiriesCount: 0,
  });

  const [stats, setStats] = useState<PublicStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await getPublicStats();
      if (error) {
        toast.error("Could not load marketing stats.");
      } else if (data) {
        setStats(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: stats + pulse in parallel.
  useEffect(() => {
    void (async () => {
      const [, p] = await Promise.all([fetchStats(), getMarketingStatusPulse()]);
      setPulse(p);
    })();
  }, [fetchStats]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const { success } = await refreshPublicStats();
      if (!success) {
        toast.error("Could not refresh stats. Please try again.");
      } else {
        toast.success("Stats refreshed.");
      }
      await fetchStats();
      // Pulse will recompute cache freshness on next pulse fetch.
      const p = await getMarketingStatusPulse();
      setPulse(p);
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
    {
      key: "subscribers",
      label: "Subscribers",
      icon: <Mail className="h-4 w-4" />,
    },
    { key: "blog", label: "Blog", icon: <FileText className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <MarketingStatusPulseStrip pulse={pulse} basePath="/admin/marketing" />

      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Marketing</h1>
        <p className="text-sm text-[#666666]">
          Manage public-facing content, testimonials, and embeddable widgets.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-muted/40 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-background text-[#1A1A1A] shadow-sm"
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
              {refreshing ? "Refreshing…" : "Refresh Now"}
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-2xl bg-muted/40"
                />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {STAT_CONFIG.map((cfg) => (
                <CountTile
                  key={cfg.key}
                  label={cfg.label}
                  value={Math.round(stats[cfg.key] as number)}
                  formatted={cfg.format(stats[cfg.key] as number)}
                  icon={cfg.icon}
                />
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
          <div className="rounded-2xl border bg-background p-8 text-center hover:shadow-md transition">
            <MessageSquareQuote className="mx-auto h-12 w-12 text-primary opacity-50" />
            <p className="mt-3 text-sm text-[#666666]">
              Review pending feedback and approve testimonials for your marketing
              website.
            </p>
            <p className="mt-1 text-xs text-[#666666]">
              {pulse.pendingTestimonialsCount} pending ·{" "}
              {pulse.approvedThisWeekCount} approved this week
            </p>
            <Link href="/admin/marketing/testimonials">
              <Button className="mt-4 bg-primary hover:bg-[#d4641f]">
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
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {["Stats Bar", "Sports Grid", "Testimonial Carousel", "Enquiry Form"].map(
              (widget) => (
                <div
                  key={widget}
                  className="rounded-2xl border bg-background p-5 hover:shadow-md transition"
                >
                  <div className="flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-primary" />
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

      {/* Subscribers — a jump-off point, not a summary. The count lives
          on the destination page: this page is "use client", and
          newsletter_subscribers is service-role only (RLS on, no
          policies), so a count can't be read from here without a new
          server action. Not worth one for a number shown twice. */}
      {activeTab === "subscribers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#1A1A1A]">
                Newsletter Subscribers
              </h2>
              <p className="text-sm text-[#666666]">
                View and export signups from the marketing website.
              </p>
            </div>
            <Link href="/admin/marketing/subscribers">
              <Button variant="outline" size="sm" className="gap-2">
                View Subscribers
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="rounded-2xl border bg-background p-8 text-center hover:shadow-md transition">
            <Mail className="mx-auto h-12 w-12 text-primary opacity-50" />
            <p className="mt-3 text-sm text-[#666666]">
              Everyone who has signed up through the website newsletter form,
              newest first. Export the list as a CSV.
            </p>
            <Link href="/admin/marketing/subscribers">
              <Button className="mt-4 bg-primary hover:bg-[#d4641f]">
                Go to Subscribers
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Blog — a jump-off point, like Subscribers above. No post count
          here: this page is "use client", and the blog actions gate on
          the admin role server-side, so a count would cost a round trip
          for a number the destination already shows. */}
      {activeTab === "blog" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#1A1A1A]">Blog</h2>
              <p className="text-sm text-[#666666]">
                Write and publish posts for the marketing website.
              </p>
            </div>
            <Link href="/admin/marketing/blog">
              <Button variant="outline" size="sm" className="gap-2">
                Manage Posts
                <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="rounded-2xl border bg-background p-8 text-center hover:shadow-md transition">
            <FileText className="mx-auto h-12 w-12 text-primary opacity-50" />
            <p className="mt-3 text-sm text-[#666666]">
              Draft posts in Markdown with a live preview, then publish them
              to the website when they are ready.
            </p>
            <Link href="/admin/marketing/blog">
              <Button className="mt-4 bg-primary hover:bg-[#d4641f]">
                Go to Blog
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
