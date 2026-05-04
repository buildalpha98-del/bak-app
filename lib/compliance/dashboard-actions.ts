"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  bucketCertExpiry,
  TRACKED_EXPIRY_TYPES,
  type CertBucketResult,
} from "@/lib/utils/compliance/cert-expiry-summary";

export type { CertBucketResult } from "@/lib/utils/compliance/cert-expiry-summary";

/**
 * Aggregate cert-expiry buckets across every active coach.
 * Drives the admin dashboard CertExpirySnapshot card.
 */
export async function getCertExpirySnapshot(): Promise<{
  data: CertBucketResult | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("compliance_docs")
      .select(
        "id, user_id, doc_type, expiry_date, status, profiles:user_id(name, status)",
      )
      .in("doc_type", [...TRACKED_EXPIRY_TYPES]);

    if (error) throw error;

    const rows = (data ?? [])
      .filter((r) => {
        const profile = r.profiles as unknown as { status?: string } | null;
        // Only roll up active coaches; archived/onboarding rows are noise.
        return profile?.status === "active";
      })
      .map((r) => {
        const profile = r.profiles as unknown as { name?: string } | null;
        return {
          id: r.id as string,
          user_id: r.user_id as string,
          user_name: (profile?.name as string) ?? null,
          doc_type: r.doc_type,
          expiry_date: r.expiry_date,
          status: r.status,
        };
      });

    return { data: bucketCertExpiry(rows, new Date()), error: null };
  } catch (err) {
    console.error("getCertExpirySnapshot error:", err);
    return { data: null, error: "Failed to load compliance snapshot." };
  }
}
