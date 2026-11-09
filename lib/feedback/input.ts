import { z } from "zod";
import { rateLimit } from "@/lib/utils/rateLimit";
export const publicFeedbackSchema = z.object({
  token: z.string().min(1).max(200),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).nullable().optional(),
}).strict();
export function allowFeedback(headers: Headers) {
  const ip = (headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  return rateLimit(`feedback:${ip}`, 10).success;
}
