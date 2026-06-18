"use client";

// ============================================================
// ComparisonBadge — inline delta indicator for pulses + KPIs
// ============================================================
//
// Renders next to a number to show how it's moved versus a prior
// period. Three states: ▲ up, ▼ down, → flat. Colour reflects
// `isGood` when supplied (emerald for good, red for bad), or falls
// back to a neutral direction-only palette when the caller hasn't
// said which way is "good". Flat moves render muted so a stable
// number doesn't shout.
//
// A title-tip wrapper carries the full "was 38 last week" context
// — we use the native `title` attribute rather than the radix
// Tooltip primitive so the badge works inside any container
// without requiring a `TooltipProvider` ancestor. The KPI cards
// and pulse strips don't all share a provider today, and adding
// one project-wide is out of scope for this feature.

import type { ComparisonDelta } from "@/lib/comparison/delta";

interface ComparisonBadgeProps {
  delta: ComparisonDelta;
  /** Short suffix shown after the arrow, e.g. "vs last week". */
  label?: string;
  /** Use percent rather than absolute diff in the badge body. */
  format?: "diff" | "percent" | "auto";
  /** Show as raw text rather than a pill — for inline KPI cards. */
  variant?: "pill" | "inline";
}

export function ComparisonBadge({
  delta,
  label,
  format = "auto",
  variant = "pill",
}: ComparisonBadgeProps) {
  const arrow =
    delta.direction === "up"
      ? "▲"
      : delta.direction === "down"
      ? "▼"
      : "→";

  // Default to percent when it's meaningful and not absurdly large,
  // otherwise fall back to the absolute diff. The 1000%-cap is a
  // sanity guard — if previous was 1 and current is 1000, "+99,900%"
  // is noise and the absolute number ("+999") is far more readable.
  const usePercent =
    format === "percent" ||
    (format === "auto" &&
      delta.percent !== null &&
      Math.abs(delta.percent) < 1000);

  const body =
    delta.direction === "flat"
      ? "flat"
      : usePercent && delta.percent !== null
      ? `${delta.diff >= 0 ? "+" : ""}${delta.percent.toFixed(0)}%`
      : `${delta.diff >= 0 ? "+" : ""}${formatNumber(delta.diff)}`;

  // Colour selection. When `isGood` is supplied, we trust it; when
  // not, the direction alone drives the palette but stays muted for
  // anything that's just "moved" without a known good direction.
  const tone = pickTone(delta);

  const title = buildTitle(delta, label);

  if (variant === "inline") {
    return (
      <span
        title={title}
        className={`inline-flex items-center gap-0.5 text-xs tabular-nums ${tone.text}`}
        aria-label={title}
      >
        <span aria-hidden>{arrow}</span>
        <span>{body}</span>
        {label && <span className="ml-1 text-muted-foreground">{label}</span>}
      </span>
    );
  }

  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${tone.bg} ${tone.text}`}
    >
      <span aria-hidden>{arrow}</span>
      <span>{body}</span>
      {label && <span className="ml-1 opacity-70">{label}</span>}
    </span>
  );
}

function pickTone(delta: ComparisonDelta): { bg: string; text: string } {
  if (delta.direction === "flat") {
    return { bg: "bg-muted", text: "text-muted-foreground" };
  }

  if (delta.isGood === true) {
    return { bg: "bg-emerald-50", text: "text-emerald-700" };
  }
  if (delta.isGood === false) {
    return { bg: "bg-red-50", text: "text-red-700" };
  }

  // Neutral fallback when caller didn't specify goodDirection.
  if (delta.direction === "up") {
    return { bg: "bg-emerald-50", text: "text-emerald-700" };
  }
  return { bg: "bg-amber-50", text: "text-amber-700" };
}

function buildTitle(delta: ComparisonDelta, label?: string): string {
  const prev = formatNumber(delta.previous);
  const cur = formatNumber(delta.current);
  const suffix = label ? ` ${label}` : "";
  if (delta.direction === "flat") {
    return `Unchanged${suffix} (was ${prev})`;
  }
  const pctPart =
    delta.percent === null ? "" : ` (${delta.percent.toFixed(1)}%)`;
  return `${cur} now, was ${prev}${pctPart}${suffix}`;
}

function formatNumber(n: number): string {
  // Bare integer formatting with locale separators — keeps revenue
  // (which can hit 7 figures) readable without dragging in a date
  // formatter.
  if (Number.isInteger(n)) return n.toLocaleString("en-AU");
  return n.toLocaleString("en-AU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
