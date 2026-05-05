// ============================================================
// Smart Scheduling Utilities
// Reused by roster views, swap request flow, and ops command centre
// ============================================================

import type { SessionWithRelations } from "@/lib/sessions/actions";
import type { AvailabilitySlot, ComplianceDoc, Centre } from "@/lib/types/database";
import type { ComplianceDocType } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

export type AvailabilityStatus = "available" | "partial" | "unavailable";

export interface CoachAvailabilityResult {
  coachId: string;
  coachName: string;
  status: AvailabilityStatus;
  reason: string;
  /** Whether the coach has a time match */
  timeMatch: boolean;
  /** Whether location preferences include the session area */
  locationMatch: boolean;
}

export type ClashType = "time_overlap" | "travel_buffer" | "compliance";

export interface ClashResult {
  type: ClashType;
  coachId: string;
  coachName: string;
  sessionA: SessionWithRelations;
  sessionB?: SessionWithRelations;
  description: string;
  suggestion: string;
  /** For compliance clashes */
  complianceDetail?: {
    docType: ComplianceDocType;
    expiryDate: string;
  };
  /** For travel buffer clashes */
  travelDetail?: {
    estimatedMinutes: number;
    gapMinutes: number;
  };
}

export interface ComplianceCheckResult {
  coachId: string;
  coachName: string;
  isCompliant: boolean;
  issues: {
    docType: ComplianceDocType;
    status: "expired" | "missing";
    expiryDate: string | null;
  }[];
}

export interface ReplacementSuggestion {
  coachId: string;
  coachName: string;
  score: number;
  reasons: string[];
  availability: AvailabilityStatus;
}

// ============================================================
// Mandatory compliance document types
// ============================================================

const MANDATORY_DOC_TYPES: ComplianceDocType[] = ["wwcc", "first_aid"];

// ============================================================
// Time helpers
// ============================================================

/** Convert "HH:mm" or "HH:mm:ss" to total minutes since midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Convert total minutes since midnight to "HH:mm" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Get end time in minutes given start "HH:mm" and duration */
export function getEndMinutes(startTime: string, duration: number): number {
  return timeToMinutes(startTime) + duration;
}

/** Check if two time ranges overlap */
export function timesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && endA > startB;
}

// ============================================================
// 1. checkAvailability
// ============================================================

/**
 * Check if a coach is available for a given day/time window.
 * Returns the availability status and reason.
 */
export function checkAvailability(
  slots: AvailabilitySlot[],
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  centreAddress?: string | null,
  existingSessions?: { time: string; duration_minutes: number; centre_name: string }[]
): { status: AvailabilityStatus; reason: string } {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  // Check for clashes with existing sessions first
  if (existingSessions) {
    for (const es of existingSessions) {
      const esStart = timeToMinutes(es.time);
      const esEnd = esStart + es.duration_minutes;
      if (timesOverlap(startMin, endMin, esStart, esEnd)) {
        const esTimeFormatted = es.time.slice(0, 5);
        return {
          status: "unavailable",
          reason: `Already assigned: ${esTimeFormatted} ${es.centre_name}`,
        };
      }
    }
  }

  // Find slots for this day
  const daySlots = slots.filter((s) => s.day_of_week === dayOfWeek);

  if (daySlots.length === 0) {
    const dayNames = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return {
      status: "unavailable",
      reason: `Not available ${dayNames[dayOfWeek] ?? "this day"}`,
    };
  }

  // Check if any slot fully covers the session time
  let partialMatch = false;
  for (const slot of daySlots) {
    const slotStart = timeToMinutes(slot.start_time);
    const slotEnd = timeToMinutes(slot.end_time);

    if (startMin >= slotStart && endMin <= slotEnd) {
      // Full time match — now check location
      if (centreAddress && slot.location_preferences.length > 0) {
        const addressLower = centreAddress.toLowerCase();
        const locationMatch = slot.location_preferences.some((pref) =>
          addressLower.includes(pref.toLowerCase())
        );
        if (!locationMatch) {
          return {
            status: "partial",
            reason: `Time available but location not in preferences`,
          };
        }
      }
      return { status: "available", reason: "Available" };
    }

    // Check for partial overlap (edge of window)
    if (timesOverlap(startMin, endMin, slotStart, slotEnd)) {
      partialMatch = true;
    }
  }

  if (partialMatch) {
    return {
      status: "partial",
      reason: "Session is at the edge of availability window",
    };
  }

  return {
    status: "unavailable",
    reason: "Not available at this time",
  };
}

// ============================================================
// 2. detectClashes
// ============================================================

/**
 * Scan a week's sessions for clashes: time overlaps, insufficient travel
 * buffer, and compliance gaps.
 */
export function detectClashes(
  sessions: SessionWithRelations[],
  complianceDocs: { coach_id: string; doc_type: ComplianceDocType; expiry_date: string | null; status: string }[],
  centres: Pick<Centre, "id" | "latitude" | "longitude">[],
  coachNames: Map<string, string>
): ClashResult[] {
  const clashes: ClashResult[] = [];

  // Group sessions by coach
  const sessionsByCoach = new Map<string, SessionWithRelations[]>();
  for (const s of sessions) {
    if (!s.coach_id || s.status === "cancelled") continue;
    const arr = sessionsByCoach.get(s.coach_id) ?? [];
    arr.push(s);
    sessionsByCoach.set(s.coach_id, arr);
  }

  const centreMap = new Map(centres.map((c) => [c.id, c]));

  for (const [coachId, coachSessions] of sessionsByCoach) {
    const coachName = coachNames.get(coachId) ?? "Unknown Coach";

    // Sort by date then time
    const sorted = [...coachSessions].sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.time.localeCompare(b.time);
    });

    // Check time overlaps and travel buffer
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];

        // Only check same day
        if (a.date !== b.date) break;

        const aStart = timeToMinutes(a.time);
        const aEnd = aStart + a.duration_minutes;
        const bStart = timeToMinutes(b.time);
        const bEnd = bStart + b.duration_minutes;

        // Time overlap
        if (timesOverlap(aStart, aEnd, bStart, bEnd)) {
          clashes.push({
            type: "time_overlap",
            coachId,
            coachName,
            sessionA: a,
            sessionB: b,
            description: `${coachName} is double-booked: ${a.centre_name} (${a.time.slice(0, 5)}) overlaps with ${b.centre_name} (${b.time.slice(0, 5)})`,
            suggestion: `Remove ${coachName} from ${a.centre_name} or ${b.centre_name}`,
          });
          continue;
        }

        // Travel buffer (only if different centres and sessions are consecutive)
        if (a.centre_id !== b.centre_id) {
          const gapMinutes = bStart - aEnd;

          const centreA = centreMap.get(a.centre_id);
          const centreB = centreMap.get(b.centre_id);

          const travelMinutes =
            centreA?.latitude != null &&
            centreA.longitude != null &&
            centreB?.latitude != null &&
            centreB.longitude != null
              ? estimateTravelTime(
                  { lat: centreA.latitude, lng: centreA.longitude },
                  { lat: centreB.latitude, lng: centreB.longitude }
                )
              : 15; // Default 15 min if coordinates unknown

          if (gapMinutes < Math.max(30, travelMinutes)) {
            clashes.push({
              type: "travel_buffer",
              coachId,
              coachName,
              sessionA: a,
              sessionB: b,
              description: `${coachName} has ${gapMinutes}min gap between ${a.centre_name} and ${b.centre_name} (est. ${Math.round(travelMinutes)}min travel)`,
              suggestion:
                gapMinutes < travelMinutes
                  ? `Add buffer or swap coaches between sessions`
                  : `Consider adding a 15min buffer`,
              travelDetail: {
                estimatedMinutes: Math.round(travelMinutes),
                gapMinutes,
              },
            });
          }
        }
      }
    }

    // Compliance check
    const coachDocs = complianceDocs.filter((d) => d.coach_id === coachId);
    const today = new Date().toISOString().split("T")[0];

    for (const docType of MANDATORY_DOC_TYPES) {
      const doc = coachDocs.find((d) => d.doc_type === docType);
      const isExpired =
        !doc ||
        doc.status === "expired" ||
        doc.status === "rejected" ||
        (doc.expiry_date && doc.expiry_date < today);

      if (isExpired) {
        // Add one clash per coach (not per session)
        const affectedSession = sorted[0]; // Use first session for reference
        const docLabel = docType === "wwcc" ? "WWCC" : "First Aid";
        clashes.push({
          type: "compliance",
          coachId,
          coachName,
          sessionA: affectedSession,
          description: `${coachName}'s ${docLabel} is ${doc ? "expired" : "missing"}${doc?.expiry_date ? ` (expired ${doc.expiry_date})` : ""}`,
          suggestion: `Reassign sessions or request ${docLabel} renewal from ${coachName}`,
          complianceDetail: doc
            ? { docType, expiryDate: doc.expiry_date ?? "" }
            : { docType, expiryDate: "" },
        });
      }
    }
  }

  return clashes;
}

// ============================================================
// 3. estimateTravelTime
// ============================================================

/**
 * Estimate travel time between two coordinates using straight-line distance.
 * Formula: haversine distance × 1.4 (road factor) ÷ 30 km/h (urban speed).
 * Returns estimated travel time in minutes.
 */
export function estimateTravelTime(
  centreA: { lat: number; lng: number },
  centreB: { lat: number; lng: number }
): number {
  const distKm = haversineDistance(
    centreA.lat,
    centreA.lng,
    centreB.lat,
    centreB.lng
  );

  // Road distance ≈ straight-line × 1.4
  const roadDistKm = distKm * 1.4;

  // Average speed: 30 km/h for urban SW Sydney
  const travelHours = roadDistKm / 30;

  return Math.max(5, travelHours * 60); // Minimum 5 minutes
}

/** Haversine formula to calculate distance between two lat/lng points in km */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ============================================================
// 4. checkComplianceStatus
// ============================================================

/**
 * Check a coach's mandatory compliance document status.
 *
 * "Expired" matches the cert-guard rule: a cert whose `expiry_date <= today`
 * is treated as already expired (consistent with the hard guard's
 * "same-day expiry counts as expired" semantics in
 * `lib/utils/compliance/cert-guard.ts`).
 */
export function checkComplianceStatus(
  coachId: string,
  coachName: string,
  docs: Pick<ComplianceDoc, "doc_type" | "expiry_date" | "status">[]
): ComplianceCheckResult {
  const today = new Date().toISOString().split("T")[0];
  const issues: ComplianceCheckResult["issues"] = [];

  for (const docType of MANDATORY_DOC_TYPES) {
    const doc = docs.find((d) => d.doc_type === docType);

    if (!doc || doc.status === "rejected") {
      issues.push({ docType, status: "missing", expiryDate: null });
    } else if (
      doc.status === "expired" ||
      (doc.expiry_date && doc.expiry_date <= today)
    ) {
      issues.push({
        docType,
        status: "expired",
        expiryDate: doc.expiry_date,
      });
    }
  }

  return {
    coachId,
    coachName,
    isCompliant: issues.length === 0,
    issues,
  };
}

// ============================================================
// 5. rankReplacements
// ============================================================

/**
 * Score and rank replacement coach suggestions.
 * Higher score = better match.
 */
export function rankReplacements(
  candidates: {
    coachId: string;
    coachName: string;
    availability: AvailabilityStatus;
    distanceScore: number; // 0-1, higher = closer
    utilisationHours: number;
    sportExperience: boolean;
  }[]
): ReplacementSuggestion[] {
  return candidates
    .map((c) => {
      let score = 0;
      const reasons: string[] = [];

      // Availability score (0-40)
      if (c.availability === "available") {
        score += 40;
        reasons.push("Fully available");
      } else if (c.availability === "partial") {
        score += 20;
        reasons.push("Partially available");
      } else {
        // Unavailable coaches shouldn't be suggested, but score low just in case
        score += 0;
        reasons.push("Not available");
      }

      // Distance score (0-25)
      score += c.distanceScore * 25;
      if (c.distanceScore >= 0.7) {
        reasons.push("Close to venue");
      }

      // Utilisation (lower is better) (0-20)
      // Max 40 hours/week considered full
      const utilisationScore = Math.max(0, 1 - c.utilisationHours / 40);
      score += utilisationScore * 20;
      if (c.utilisationHours < 15) {
        reasons.push("Low utilisation this week");
      }

      // Sport experience (0-15)
      if (c.sportExperience) {
        score += 15;
        reasons.push("Has delivered this sport before");
      }

      return {
        coachId: c.coachId,
        coachName: c.coachName,
        score: Math.round(score),
        reasons,
        availability: c.availability,
      };
    })
    .sort((a, b) => b.score - a.score);
}
