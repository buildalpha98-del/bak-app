"use server";

// ============================================================
// Launch Foundation — Storage bucket setup
// Run once to create the required Supabase Storage buckets.
// Can be called from an admin setup page or via a one-off script.
// ============================================================

import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function setupStorageBuckets(): Promise<{
  success: boolean;
  results: Array<{ bucket: string; created: boolean; error?: string }>;
}> {
  const supabase = createSupabaseAdmin();
  const results: Array<{ bucket: string; created: boolean; error?: string }> = [];

  const buckets = [
    { id: "session-photos", public: false },
    { id: "invoices", public: false },
  ];

  for (const bucket of buckets) {
    const { error } = await supabase.storage.createBucket(bucket.id, {
      public: bucket.public,
      fileSizeLimit: bucket.id === "session-photos" ? 10 * 1024 * 1024 : 5 * 1024 * 1024, // 10MB photos, 5MB invoices
      allowedMimeTypes:
        bucket.id === "session-photos"
          ? ["image/jpeg", "image/png", "image/webp", "image/heic"]
          : ["application/pdf"],
    });

    if (error && !error.message?.includes("already exists")) {
      results.push({ bucket: bucket.id, created: false, error: error.message });
    } else {
      results.push({ bucket: bucket.id, created: !error });
    }
  }

  // Set up storage policies for session-photos
  // Coaches can upload, admin can read all, coach can read own uploads
  await supabase.rpc("exec_sql", {
    sql: `
      -- Session photos: coaches can upload
      CREATE POLICY IF NOT EXISTS "Coaches upload session photos"
        ON storage.objects FOR INSERT
        WITH CHECK (
          bucket_id = 'session-photos'
          AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
        );

      -- Session photos: coaches read own, admin reads all
      CREATE POLICY IF NOT EXISTS "Users read session photos"
        ON storage.objects FOR SELECT
        USING (
          bucket_id = 'session-photos'
          AND (
            EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
            OR auth.uid()::text = (storage.foldername(name))[1]
          )
        );

      -- Invoices: admin only upload
      CREATE POLICY IF NOT EXISTS "Admin uploads invoices"
        ON storage.objects FOR INSERT
        WITH CHECK (
          bucket_id = 'invoices'
          AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
        );

      -- Invoices: admin + centre directors read
      CREATE POLICY IF NOT EXISTS "Users read invoices"
        ON storage.objects FOR SELECT
        USING (
          bucket_id = 'invoices'
          AND (
            EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
            OR EXISTS (
              SELECT 1 FROM centres c
              WHERE c.contact_email = (SELECT email FROM profiles WHERE id = auth.uid())
            )
          )
        );
    `,
  });

  return { success: results.every((r) => r.created || !r.error), results };
}
