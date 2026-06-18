// ============================================================
// Delta helper — pure arithmetic, no IO
// ============================================================
//
// Turn (current, previous) into the shape the ComparisonBadge
// expects. Caller supplies the `goodDirection` because "up" is
// great for revenue but bad for churn — without it we'd colour
// the badge wrong.
//
// Flat threshold: small percent moves don't deserve an arrow.
// Defaults to 0.5% so a 412 → 414 nudge renders as "→ flat"
// instead of "▲ +0.5%". Override per call when sensitivity matters
// (e.g. financial alerts).

export interface ComparisonDelta {
  current: number;
  previous: number;
  /** current - previous. Negative when current dropped. */
  diff: number;
  /**
   * Percent change `(current / previous - 1) * 100`. Null when
   * `previous` is exactly 0 — division by zero, no meaningful %.
   * Callers should fall back to the absolute `diff` in that case.
   */
  percent: number | null;
  /** Visual direction the badge should render. */
  direction: "up" | "down" | "flat";
  /** Caller-supplied: which direction is "good" in this context. */
  goodDirection?: "up" | "down";
  /** True when `goodDirection` matches `direction` (or direction is flat with no opinion). */
  isGood?: boolean;
}

export interface ComputeDeltaOpts {
  goodDirection?: "up" | "down";
  /** Percent change below this magnitude renders as 'flat'. Default 0.5. */
  flatThreshold?: number;
}

export function computeDelta(
  current: number,
  previous: number,
  opts: ComputeDeltaOpts = {}
): ComparisonDelta {
  const flatThreshold = opts.flatThreshold ?? 0.5;
  const diff = current - previous;

  let percent: number | null;
  if (previous === 0) {
    percent = null;
  } else {
    percent = (current / previous - 1) * 100;
  }

  // Direction respects the flat band: we look at percent magnitude
  // when available, otherwise raw diff (handles the previous=0 case
  // where any move is meaningful but we have no % to threshold on).
  let direction: "up" | "down" | "flat";
  if (percent === null) {
    direction = diff === 0 ? "flat" : diff > 0 ? "up" : "down";
  } else if (Math.abs(percent) < flatThreshold) {
    direction = "flat";
  } else {
    direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  }

  const delta: ComparisonDelta = {
    current,
    previous,
    diff,
    percent,
    direction,
  };

  if (opts.goodDirection) {
    delta.goodDirection = opts.goodDirection;
    // Flat is neither good nor bad; treat as good so the badge stays
    // muted/neutral rather than alarmist.
    delta.isGood =
      direction === "flat" ? true : direction === opts.goodDirection;
  }

  return delta;
}
