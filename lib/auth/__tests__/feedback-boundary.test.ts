import { it, expect } from "vitest";
import { publicFeedbackSchema, allowFeedback } from "@/lib/feedback/input";
it("rejects unbounded feedback, fractional ratings and unexpected payload fields", () => {
  expect(publicFeedbackSchema.safeParse({ token: "token", rating: 4, comment: "x".repeat(2001) }).success).toBe(false);
  expect(publicFeedbackSchema.safeParse({ token: "token", rating: 4.5 }).success).toBe(false);
  expect(publicFeedbackSchema.safeParse({ token: "token", rating: 4, submitted_at: "forged" }).success).toBe(false);
  expect(publicFeedbackSchema.safeParse({ token: "token", rating: 4, comment: "Good" }).success).toBe(true);
});
it("shares the feedback cooldown across API and action callers", () => {
  const headers = new Headers({ "x-forwarded-for": "192.0.2.27" });
  for (let i = 0; i < 10; i++) expect(allowFeedback(headers)).toBe(true);
  expect(allowFeedback(headers)).toBe(false);
});
