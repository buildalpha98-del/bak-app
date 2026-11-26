"use server";

import * as internal from "./internal";

export async function getParentReferralData(...args: Parameters<typeof internal.getParentReferralData>) {
  return internal.getParentReferralData(...args);
}

export async function getReferralByCode(...args: Parameters<typeof internal.getReferralByCode>) {
  return internal.getReferralByCode(...args);
}

export async function getParentReferralCredits(...args: Parameters<typeof internal.getParentReferralCredits>) {
  return internal.getParentReferralCredits(...args);
}

export async function getAdminReferralDashboard(...args: Parameters<typeof internal.getAdminReferralDashboard>) {
  return internal.getAdminReferralDashboard(...args);
}

export async function getAdminReferralConfig(...args: Parameters<typeof internal.getAdminReferralConfig>) {
  return internal.getAdminReferralConfig(...args);
}

export async function updateReferralConfig(...args: Parameters<typeof internal.updateReferralConfig>) {
  return internal.updateReferralConfig(...args);
}

export async function generateCentreReferralCodes(...args: Parameters<typeof internal.generateCentreReferralCodes>) {
  return internal.generateCentreReferralCodes(...args);
}

export async function getCentreReferralStats(...args: Parameters<typeof internal.getCentreReferralStats>) {
  return internal.getCentreReferralStats(...args);
}
export type { ReferralCode, Referral, ReferralReward, ReferralConfig, MilestoneProgress, ParentReferralData } from "./internal";
