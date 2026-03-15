/**
 * Region auto-assignment utility.
 *
 * Pure function that matches a suburb string against a list of regions
 * and returns the matching region ID (if any). Used during centre creation,
 * lead creation, and bookable session creation flows.
 */

export interface RegionSuburbEntry {
  id: string;
  name: string;
  suburbs: string[];
  status: string;
}

/**
 * Given a suburb name and a list of regions, return the first active region
 * whose suburbs array contains a case-insensitive match.
 *
 * @param suburb - The suburb to look up (e.g. "Bankstown")
 * @param regions - Array of regions with their suburb lists
 * @returns The matching region's id and name, or null if no match
 */
export function assignRegionBySuburb(
  suburb: string,
  regions: RegionSuburbEntry[]
): { regionId: string; regionName: string } | null {
  if (!suburb?.trim()) return null;

  const normalised = suburb.trim().toLowerCase();

  for (const region of regions) {
    // Only match against active regions
    if (region.status !== "active") continue;

    const suburbs = region.suburbs ?? [];
    if (suburbs.some((s) => s.trim().toLowerCase() === normalised)) {
      return { regionId: region.id, regionName: region.name };
    }
  }

  return null;
}
