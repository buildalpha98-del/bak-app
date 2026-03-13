import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

export const FROM_EMAIL = "Build Alpha Kids <noreply@buildalphakids.com.au>";
