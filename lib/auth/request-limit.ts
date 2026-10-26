import "server-only";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import { rateLimit } from "@/lib/utils/rateLimit";

// Per-instance defence, using the existing limiter. Shared storage is a separate deployment change.
export async function limitAuthEmail(email: string): Promise<string | null> {
  const parsed = z.email().max(320).safeParse(email);
  if (!parsed.success) return "Invalid email address.";
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  const key = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  if (!rateLimit(`auth-ip:${ip}`, 10, 60_000).success || !rateLimit(`auth-email:${key}`, 1, 60_000).success) {
    return "Please wait before requesting another email.";
  }
  return null;
}
