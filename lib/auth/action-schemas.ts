import { z } from "zod";
const text = z.string().trim().max(500);
const date = z.iso.date();
export const idSchema = z.uuid();
export const staffUpdateSchema = z.object({
  name: text.min(1).optional(), phone: text.nullable().optional(), address: text.nullable().optional(),
  date_of_birth: date.nullable().optional(), emergency_contact_name: text.nullable().optional(),
  emergency_contact_phone: text.nullable().optional(), abn: text.nullable().optional(),
  default_pay_rate: z.number().nonnegative().nullable().optional(),
  role: z.enum(["admin", "ops", "coach", "parent"]).optional(),
}).strict();
export const payRateSchema = z.object({
  id: idSchema.optional(), user_id: idSchema,
  session_type: z.enum(["childcare", "school_local", "school_travel", "holiday_clinic"]),
  rate: z.number().nonnegative(), rate_unit: z.enum(["per_session", "per_hour"]), effective_from: date,
}).strict();
export const centreUpdateSchema = z.object({
  name: text.min(1).optional(), type: z.enum(["childcare_centre", "school"]).optional(),
  address: text.nullable().optional(), primary_contact_name: text.nullable().optional(),
  primary_contact_phone: text.nullable().optional(), primary_contact_email: z.union([z.email(), z.literal("")]).nullable().optional(),
  primary_contact_role: text.nullable().optional(), group_size: z.number().int().nonnegative().nullable().optional(),
  age_groups: z.array(text).max(20).optional(), pricing_model: z.enum(["centre_funded", "parent_funded", "per_head"]).optional(),
  agreed_rate: z.number().nonnegative().nullable().optional(), session_preferences: z.record(z.string(), z.unknown()).optional(),
  contract_status: z.enum(["active", "trial", "paused", "churned"]).optional(),
  colour: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), brand_colour: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  branding_mode: z.enum(["bak_branded", "white_label"]).optional(), curriculum_framework: z.enum(["nsw", "vic"]).optional(),
}).strict();
export const termCreateSchema = z.object({ name: text.min(1), start_date: date, end_date: date, year: z.number().int().min(2000).max(2200) }).strict()
  .refine(v => v.end_date >= v.start_date, "End date must follow start date.");
export const termUpdateSchema = z.object({ name: text.min(1).optional(), start_date: date.optional(), end_date: date.optional(), year: z.number().int().min(2000).max(2200).optional(), status: z.enum(["draft", "active", "completed"]).optional() }).strict()
  .refine(v => !v.start_date || !v.end_date || v.end_date >= v.start_date, "End date must follow start date.");
