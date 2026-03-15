import { z } from "zod";

export const proposalGenerateSchema = z.object({
  leadId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
});

export const insightGenerateSchema = z.object({
  childId: z.string().uuid(),
  termId: z.string().uuid().optional(),
  centreId: z.string().uuid().optional(),
});

export const paymentCreateSchema = z.object({
  bookingId: z.string().uuid(),
  amountCents: z.number().int().min(0),
  paymentMethod: z.string(),
  nonce: z.string().optional(),
});

export const bookingCreateSchema = z.object({
  sessionId: z.string().uuid(),
  childIds: z.array(z.string().uuid()).min(1),
  paymentType: z.enum(["single_payment", "package_redemption"]),
});
