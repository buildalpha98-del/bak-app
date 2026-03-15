import type { AgeGroup } from "@/lib/types/enums";

/**
 * Calculate age group from date of birth.
 * Age groups: 3-5, 5-8, 8-12
 */
export function calculateAgeGroup(dob: Date): AgeGroup {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  if (age >= 8) return "8-12";
  if (age >= 5) return "5-8";
  return "3-5";
}

/**
 * Calculate age in years from date of birth.
 */
export function calculateAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}
