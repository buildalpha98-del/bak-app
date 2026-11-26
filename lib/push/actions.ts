"use server";

import * as internal from "./internal";

export async function savePushSubscription(...args: Parameters<typeof internal.savePushSubscription>) {
  return internal.savePushSubscription(...args);
}

export async function deletePushSubscription(...args: Parameters<typeof internal.deletePushSubscription>) {
  return internal.deletePushSubscription(...args);
}

export async function getPushSubscriptionCount(...args: Parameters<typeof internal.getPushSubscriptionCount>) {
  return internal.getPushSubscriptionCount(...args);
}

export async function sendTestPush(...args: Parameters<typeof internal.sendTestPush>) {
  return internal.sendTestPush(...args);
}
export type { PushPayload, PushSubscriptionRow } from "./internal";
