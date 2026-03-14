// Pure functions (safe for any context)
export { haversineDistance, estimatedTravelMinutes, hasAdequateTravelBuffer, timeToMinutes, sessionEndMinutes } from "./travel";
export { getEligibleCoaches, scoreCoachForSession, generateRoster } from "./solver";
export type * from "./types";

// Server-only functions — import directly:
// import { assembleSchedulingInput } from "@/lib/utils/scheduling/data-assembly";
