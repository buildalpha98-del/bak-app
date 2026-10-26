"use server";

import * as internal from "./internal";

export async function cancelSessionAsCoach(...args: Parameters<typeof internal.cancelSessionAsCoach>) {
  return internal.cancelSessionAsCoach(...args);
}

export async function startRerosteringForSession(...args: Parameters<typeof internal.startRerosteringForSession>) {
  return internal.startRerosteringForSession(...args);
}

export async function sendReplacementOffer(...args: Parameters<typeof internal.sendReplacementOffer>) {
  return internal.sendReplacementOffer(...args);
}

export async function respondToReplacementOffer(...args: Parameters<typeof internal.respondToReplacementOffer>) {
  return internal.respondToReplacementOffer(...args);
}

export async function getActiveRerosteringEvents(...args: Parameters<typeof internal.getActiveRerosteringEvents>) {
  return internal.getActiveRerosteringEvents(...args);
}

export async function getRerosteringHistory(...args: Parameters<typeof internal.getRerosteringHistory>) {
  return internal.getRerosteringHistory(...args);
}
