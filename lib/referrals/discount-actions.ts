"use server";

import * as internal from "./discount-internal";

export async function validateDiscountCode(...args: Parameters<typeof internal.validateDiscountCode>) {
  return internal.validateDiscountCode(...args);
}

export async function getParentDiscountCodes(...args: Parameters<typeof internal.getParentDiscountCodes>) {
  return internal.getParentDiscountCodes(...args);
}
