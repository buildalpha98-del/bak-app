"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { getChildInsights, generateChildInsight } from "@/lib/insights/actions";
import { getParentChildren } from "@/lib/parent/actions";
import type { ChildInsight } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ChevronLeft,
  Sparkles,
  TrendingUp,
  Target,
  Lightbulb,
  Trophy,
  Calendar,
} from "lucide-react";

export default function ChildInsightsPage() {
  const params = useParams();
  const router = useRouter();
  const childId = params.childId as string;

  const [childName, setChildName] = useState("");
  const [insights, setInsights] = useState<ChildInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // Verify parent owns this child
      const { data: parentChildren } = await getParentChildren();
      const match = parentChildren.find((pc) => pc.child.id === childId);
      if (!match) {
        router.push("/parent/kids");
        return;
      }
      setChildName(`${match.child.first_name} ${match.child.last_name}`);

      // Load insights
      const { data, error: insightError } = await getChildInsights(childId);
      if (insightError) {
        setError(insightError);
      } else {
        setInsights(data);
      }
      setLoading(false);
    }
    load();
  }, [childId, router]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    const { data, error: genError } = await generateChildInsight(childId);

    setGenerating(false);

    if (genError) {
      setError(genError);
      toast.error("Could not generate insight. Please try again later.");
      return;
    }

    if (data) {
      setInsights((prev) => [data, ...prev]);
      toast.success("New development insight generated!");
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/parent/kids/${childId}`)}
            className="h-9 w-9"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-[#1A1A1A]">
              Development Insights
            </h1>
            <p className="text-sm text-[#666666]">{childName}</p>
          </div>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generating}
          className="h-11 bg-primary text-white hover:bg-[#D4651F] rounded-lg"
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Request New Insight
            </>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Empty state */}
      {insights.length === 0 && !error && (
        <div className="rounded-2xl border border-orange-100 bg-card p-8 text-center shadow-sm">
          <Sparkles className="mx-auto h-10 w-10 text-primary mb-3" />
          <h3 className="text-lg font-semibold text-[#1A1A1A]">
            No insights yet
          </h3>
          <p className="text-sm text-[#666666] mt-1 max-w-sm mx-auto">
            Insights are generated automatically at the end of each term, or you
            can request one now using the button above.
          </p>
        </div>
      )}

      {/* Insight cards */}
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} formatDate={formatDate} />
      ))}
    </div>
  );
}

// ============================================================
// Insight Card Component
// ============================================================

function InsightCard({
  insight,
  formatDate,
}: {
  insight: ChildInsight;
  formatDate: (d: string) => string;
}) {
  const [expanded, setExpanded] = useState(true);

  const sportHighlights =
    (
      insight.content_json as {
        sport_highlights?: { sport: string; observation: string }[];
      }
    )?.sport_highlights ?? [];

  return (
    <div className="rounded-2xl border border-orange-100 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Card header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-orange-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-[#666666]" />
          <span className="text-sm font-medium text-[#1A1A1A]">
            {formatDate(insight.created_at)}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              insight.insight_type === "term_end"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-purple-50 text-purple-700 border border-purple-200"
            }`}
          >
            {insight.insight_type === "term_end" ? "Term Report" : "On Demand"}
          </span>
        </div>
        <ChevronLeft
          className={`h-4 w-4 text-[#666666] transition-transform ${
            expanded ? "-rotate-90" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-orange-50">
          {/* Summary */}
          {insight.summary && (
            <div className="pt-4">
              <p className="text-sm text-[#1A1A1A] leading-relaxed">
                {insight.summary}
              </p>
            </div>
          )}

          {/* Strengths */}
          {insight.strengths && insight.strengths.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <h4 className="text-sm font-semibold text-[#1A1A1A]">
                  Strengths
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {insight.strengths.map((strength, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-medium text-green-700"
                  >
                    {strength}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Areas for Growth */}
          {insight.areas_for_growth && insight.areas_for_growth.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-amber-600" />
                <h4 className="text-sm font-semibold text-[#1A1A1A]">
                  Areas for Growth
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {insight.areas_for_growth.map((area, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700"
                  >
                    {area}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {insight.recommendations && insight.recommendations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold text-[#1A1A1A]">
                  Recommendations
                </h4>
              </div>
              <ul className="space-y-1.5">
                {insight.recommendations.map((rec, i) => (
                  <li
                    key={i}
                    className="text-sm text-[#666666] flex items-start gap-2"
                  >
                    <span className="text-primary mt-1 flex-shrink-0">
                      &bull;
                    </span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sport Highlights */}
          {sportHighlights.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="h-4 w-4 text-blue-600" />
                <h4 className="text-sm font-semibold text-[#1A1A1A]">
                  Sport Highlights
                </h4>
              </div>
              <div className="space-y-2">
                {sportHighlights.map((highlight, i) => (
                  <div
                    key={i}
                    className="rounded-lg bg-blue-50/50 border border-blue-100 px-3 py-2"
                  >
                    <span className="text-xs font-semibold text-blue-700">
                      {highlight.sport}
                    </span>
                    <p className="text-sm text-[#666666] mt-0.5">
                      {highlight.observation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
