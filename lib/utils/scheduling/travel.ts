/**
 * Travel time estimation between centres using Haversine distance.
 * Road factor 1.4x, average speed 30km/h.
 */

interface LatLng {
  latitude: number | null;
  longitude: number | null;
}

/** Haversine distance in km between two lat/lng points */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth radius km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Estimated travel minutes between two centres (distance x 1.4 road factor / 30km/h x 60) */
export function estimatedTravelMinutes(
  centreA: LatLng,
  centreB: LatLng
): number {
  if (!centreA.latitude || !centreA.longitude || !centreB.latitude || !centreB.longitude) {
    return 15; // Default 15 min if no coordinates (matches existing scheduling.ts)
  }
  const dist = haversineDistance(
    centreA.latitude, centreA.longitude,
    centreB.latitude, centreB.longitude
  );
  return Math.max(5, (dist * 1.4) / 30 * 60); // Minimum 5 min
}

/** Check if there's >= 30 min gap between two sessions accounting for travel */
export function hasAdequateTravelBuffer(
  session1EndMinutes: number,
  session2StartMinutes: number,
  centreA: LatLng,
  centreB: LatLng
): boolean {
  const travelTime = estimatedTravelMinutes(centreA, centreB);
  const buffer = Math.max(30, travelTime);
  const gap = session2StartMinutes - session1EndMinutes;
  return gap >= buffer;
}

/** Convert HH:mm time string to minutes since midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Get session end time in minutes */
export function sessionEndMinutes(startTime: string, durationMinutes: number): number {
  return timeToMinutes(startTime) + durationMinutes;
}
