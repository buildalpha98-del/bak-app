export {
  calculateCoachPerformance,
  calculateTeamBenchmarks,
  normaliseMetrics,
  calculateOverallScore,
  METRIC_WEIGHTS,
} from "./calculate";
export {
  BADGE_DEFINITIONS,
  checkBadgeEligibility,
  awardBadges,
  getCoachBadges,
} from "./badges";
export type { BadgeKey } from "./badges";
export {
  getCoachPerformance,
  getTeamRanking,
  getCoachPercentile,
} from "./helpers";
