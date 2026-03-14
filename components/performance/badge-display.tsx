"use client";

import type { LucideIcon } from "lucide-react";
import {
  Trophy,
  Award,
  Star,
  Clock,
  ClipboardCheck,
  ShieldCheck,
  Medal,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  BADGE_DEFINITIONS,
  type BadgeKey,
} from "@/lib/utils/performance/badges";

// ============================================================
// Icon map — keyed to BADGE_DEFINITIONS icon strings
// ============================================================

const BADGE_ICONS: Record<string, LucideIcon> = {
  trophy: Trophy,
  award: Award,
  star: Star,
  clock: Clock,
  "clipboard-check": ClipboardCheck,
  "shield-check": ShieldCheck,
  medal: Medal,
};

// ============================================================
// Props
// ============================================================

interface BadgeDisplayProps {
  badges: Array<{
    id: string;
    badge_key: string;
    earned_at: string;
    metadata: Record<string, unknown>;
  }>;
  showUnearned?: boolean;
  coachStats?: {
    totalSessions: number;
    avgRating: number;
    distinctSports: number;
  };
}

// ============================================================
// Helpers
// ============================================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getProgressLabel(
  key: BadgeKey,
  coachStats: BadgeDisplayProps["coachStats"]
): string | null {
  if (!coachStats) return null;

  switch (key) {
    case "fifty_sessions":
      return `${coachStats.totalSessions}/50 sessions`;
    case "century_coach":
      return `${coachStats.totalSessions}/100 sessions`;
    case "multi_sport_master":
      return `${coachStats.distinctSports}/5 sports`;
    default:
      return null;
  }
}

// ============================================================
// Single Badge item
// ============================================================

interface BadgeItemProps {
  badgeKey: BadgeKey;
  earned?: { earned_at: string };
  coachStats?: BadgeDisplayProps["coachStats"];
}

function BadgeItem({ badgeKey, earned, coachStats }: BadgeItemProps) {
  const def = BADGE_DEFINITIONS[badgeKey];
  const IconComponent = BADGE_ICONS[def.icon] ?? Trophy;
  const isEarned = Boolean(earned);
  const progress = !isEarned ? getProgressLabel(badgeKey, coachStats) : null;

  return (
    <Popover>
      <PopoverTrigger
        className="flex flex-col items-center gap-1.5 group focus:outline-none bg-transparent border-0 p-0 cursor-pointer"
        aria-label={def.name}
      >
          {/* Circle icon */}
          <div
            className={[
              "w-14 h-14 rounded-full flex items-center justify-center transition-transform group-hover:scale-105",
              isEarned
                ? "bg-amber-50 border-2 border-amber-400 shadow-sm"
                : "bg-muted border-2 border-muted-foreground/20",
            ].join(" ")}
          >
            <IconComponent
              className={[
                "w-7 h-7",
                isEarned ? "text-amber-500" : "text-muted-foreground/40",
              ].join(" ")}
              strokeWidth={1.75}
            />
          </div>

          {/* Label */}
          <span
            className={[
              "text-[10px] font-medium text-center leading-tight max-w-[56px]",
              isEarned ? "text-foreground" : "text-muted-foreground/60",
            ].join(" ")}
          >
            {def.name}
          </span>

          {/* Progress */}
          {progress && (
            <span className="text-[9px] text-muted-foreground/50">{progress}</span>
          )}
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="center"
        className="w-56 text-sm"
        sideOffset={8}
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <IconComponent
              className={[
                "w-5 h-5 shrink-0",
                isEarned ? "text-amber-500" : "text-muted-foreground/40",
              ].join(" ")}
              strokeWidth={1.75}
            />
            <p className="font-semibold text-foreground leading-tight">{def.name}</p>
          </div>
          <p className="text-muted-foreground leading-snug">{def.description}</p>
          {isEarned && earned ? (
            <p className="text-xs text-emerald-600 font-medium">
              Earned {formatDate(earned.earned_at)}
            </p>
          ) : progress ? (
            <p className="text-xs text-muted-foreground">Progress: {progress}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Not yet earned</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// BadgeDisplay
// ============================================================

export function BadgeDisplay({
  badges,
  showUnearned = false,
  coachStats,
}: BadgeDisplayProps) {
  const earnedMap = new Map(
    badges.map((b) => [b.badge_key, { earned_at: b.earned_at }])
  );

  const allKeys = Object.keys(BADGE_DEFINITIONS) as BadgeKey[];
  const earnedKeys = allKeys.filter((k) => earnedMap.has(k));
  const unearnedKeys = allKeys.filter((k) => !earnedMap.has(k));

  const displayKeys = showUnearned ? allKeys : earnedKeys;

  if (displayKeys.length === 0 && !showUnearned) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No badges earned yet — keep up the great work!
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Earned row */}
      {earnedKeys.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {earnedKeys.map((key) => (
            <BadgeItem
              key={key}
              badgeKey={key}
              earned={earnedMap.get(key)}
              coachStats={coachStats}
            />
          ))}
        </div>
      )}

      {/* Unearned row */}
      {showUnearned && unearnedKeys.length > 0 && (
        <div className="flex flex-wrap gap-4 opacity-75">
          {unearnedKeys.map((key) => (
            <BadgeItem key={key} badgeKey={key} coachStats={coachStats} />
          ))}
        </div>
      )}
    </div>
  );
}
