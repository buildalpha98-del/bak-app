"use client";

// ============================================================
// SentimentDistribution — 5-segment stacked bar widget
// ============================================================
//
// Single inline strip showing the share of 1-5 star ratings across
// the org's feedback inbox. Used as the 4th tile in the stat-card
// row on /admin/feedback. We keep it dependency-free (no recharts):
// the row is already short, and a flex of percentage-width divs
// renders crisp at any container width with no SVG overhead.

import { Star } from "lucide-react";

export interface SentimentDistributionData {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

const SEGMENT_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "bg-red-500",
  2: "bg-red-300",
  3: "bg-amber-400",
  4: "bg-emerald-300",
  5: "bg-emerald-500",
};

interface SentimentDistributionProps {
  distribution: SentimentDistributionData;
}

export function SentimentDistribution({
  distribution,
}: SentimentDistributionProps) {
  const total =
    distribution[1] +
    distribution[2] +
    distribution[3] +
    distribution[4] +
    distribution[5];

  // Empty state — keep the slot in the grid but soften visuals so it
  // doesn't read as "broken".
  if (total === 0) {
    return (
      <div className="rounded-2xl border bg-background p-5 transition hover:shadow-md">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Star className="size-4" />
          <span>Sentiment distribution</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground/70">
          No ratings yet — the bar appears once feedback comes in.
        </p>
      </div>
    );
  }

  // Build segments in display order: 1-star on the left through
  // 5-star on the right, so the negative end sits where the eye lands
  // first.
  const segments: Array<{ stars: 1 | 2 | 3 | 4 | 5; count: number; pct: number }> =
    ([1, 2, 3, 4, 5] as const).map((s) => ({
      stars: s,
      count: distribution[s],
      pct: Math.round((distribution[s] / total) * 1000) / 10,
    }));

  return (
    <div className="rounded-2xl border bg-background p-5 transition hover:shadow-md">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Star className="size-4 text-[#E8712A]" />
        <span>Sentiment distribution</span>
      </div>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((seg) =>
          seg.count > 0 ? (
            <div
              key={seg.stars}
              className={SEGMENT_COLORS[seg.stars]}
              style={{ width: `${seg.pct}%` }}
              aria-label={`${seg.stars}-star: ${seg.count} (${seg.pct}%)`}
            />
          ) : null
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {segments.map((seg) => (
          <li key={seg.stars} className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className={`inline-block size-2 rounded-sm ${SEGMENT_COLORS[seg.stars]}`}
            />
            <span className="tabular-nums">
              {seg.stars}★ {seg.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
