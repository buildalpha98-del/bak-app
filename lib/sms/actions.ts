"use server";

import * as internal from "./internal";

export async function sendSms(...args: Parameters<typeof internal.sendSms>) {
  return internal.sendSms(...args);
}

export async function setProfileSmsOptIn(...args: Parameters<typeof internal.setProfileSmsOptIn>) {
  return internal.setProfileSmsOptIn(...args);
}

export async function setParentSmsOptIn(...args: Parameters<typeof internal.setParentSmsOptIn>) {
  return internal.setParentSmsOptIn(...args);
}
export type { SendSmsInput, SendSmsResult } from "./internal";
