"use client";

// ============================================================
// Coach Performance — self pulse strip
// ============================================================
//
// Three muted, decision-shaping stats above the big score hero:
//   1. Sessions this period
//   2. Badges earned
//   3. Months tracked
//
// No bright orange — this page already has a colourful score ring.

import { Sparkles, Trophy, LineChart } from "lucide-react";
import { useCountUp } from "@/components/launch/use-count-up";

interface Props {
  sessionsThisPeriod: number;
  badgesEarned: number;
  monthsTracked: number;
}

export function CoachSelfPulseStrip({
  sessionsThisPeriod,
  badgesEarned,
  monthsTracked,
}: Props) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={Sparkles}
          count={sessionsThisPeriod}
          label={
            sessionsThisPeriod === 1
              ? "session this period"
              : "sessions this period"
          }
        />
        <Divider />
        <PulseStat
          icon={Trophy}
          count={badgesEarned}
          label={badgesEarned === 1 ? "badge earned" : "badges earned"}
          accent={badgesEarned > 0}
        />
        <Divider />
        <PulseStat
          icon={LineChart}
          count={monthsTracked}
          label={
            monthsTracked === 1 ? "month tracked" : "months tracked"
          }
        />
      </ul>
    </div>
  );
}

function Divider() {
  return (
    <li
      aria-hidden
      className="hidden h-4 w-px bg-border sm:inline-block"
    />
  );
}

function PulseStat({
  icon: Icon,
  count,
  label,
  accent = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  accent?: boolean;
}) {
  const ticked = useCountUp(count);
  return (
    <li>
      <span className="inline-flex items-center gap-1.5">
        <Icon
          className={
            accent
              ? "size-3.5 text-[#E8712A]"
              : "size-3.5 text-muted-foreground"
          }
        />
        <span
          className={
            accent
              ? "text-base font-semibold tabular-nums text-[#E8712A]"
              : "text-base font-semibold tabular-nums text-muted-foreground"
          }
        >
          {ticked}
        </span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </span>
    </li>
  );
}
