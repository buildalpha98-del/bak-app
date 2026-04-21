"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LeadDocument } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface LeadDocumentWithUploader extends LeadDocument {
  uploader_name: string | null;
}

// ============================================================
// Upload a document for a lead
// ============================================================

export async function uploadLeadDocument(input: {
  leadId: string;
  documentType: "pitch_deck" | "proposal" | "agreement" | "correspondence" | "other";
  name: string;
  file: File;
}): Promise<{ data: LeadDocument | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // 1. Upload to storage
    const fileExt = input.file.name.split(".").pop() ?? "bin";
    const storagePath = `leads/${input.leadId}/${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("lead-documents")
      .upload(storagePath, input.file);

    if (uploadError) {
      return { data: null, error: uploadError.message };
    }

    // 2. Insert record
    const { data: doc, error: insertError } = await supabase
      .from("lead_documents")
      .insert({
        lead_id: input.leadId,
        document_type: input.documentType,
        name: input.name,
        storage_path: storagePath,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (insertError || !doc) {
      return { data: null, error: insertError?.message ?? "Failed to save document record." };
    }

    // 3. Log activity
    await supabase.from("lead_activities").insert({
      lead_id: input.leadId,
      type: "system",
      content: `Document uploaded: ${input.name}`,
      metadata: { document_id: doc.id, document_type: input.documentType },
      created_by: user.id,
    });

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { data: doc, error: null };
  } catch (err) {
    console.error("uploadLeadDocument error:", err);
    return { data: null, error: "Failed to upload document." };
  }
}

// ============================================================
// Get all documents for a lead
// ============================================================

export async function getDocumentsForLead(
  leadId: string
): Promise<{ data: LeadDocumentWithUploader[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: docs, error } = await supabase
      .from("lead_documents")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: error.message };
    if (!docs || docs.length === 0) return { data: [], error: null };

    // Batch-fetch uploader names
    const uploaderIds = [...new Set(docs.map((d) => d.uploaded_by).filter(Boolean))] as string[];
    const uploaderMap: Record<string, string> = {};

    if (uploaderIds.length > 0) {
      const { data: uploaders } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", uploaderIds);

      if (uploaders) {
        for (const u of uploaders) uploaderMap[u.id] = u.name ?? "Unknown";
      }
    }

    const enriched: LeadDocumentWithUploader[] = docs.map((d) => ({
      ...d,
      uploader_name: d.uploaded_by ? (uploaderMap[d.uploaded_by] ?? null) : null,
    }));

    return { data: enriched, error: null };
  } catch (err) {
    console.error("getDocumentsForLead error:", err);
    return { data: [], error: "Failed to load documents." };
  }
}

// ============================================================
// Delete a lead document
// ============================================================

export async function deleteLeadDocument(
  documentId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 1. Get document record
    const { data: doc } = await supabase
      .from("lead_documents")
      .select("id, lead_id, name, storage_path")
      .eq("id", documentId)
      .single();

    if (!doc) return { error: "Document not found." };

    // 2. Delete from storage
    await supabase.storage.from("lead-documents").remove([doc.storage_path]);

    // 3. Delete record
    const { error: deleteError } = await supabase
      .from("lead_documents")
      .delete()
      .eq("id", documentId);

    if (deleteError) return { error: deleteError.message };

    // 4. Log activity
    await supabase.from("lead_activities").insert({
      lead_id: doc.lead_id,
      type: "system",
      content: `Document deleted: ${doc.name}`,
      created_by: user?.id ?? null,
    });

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { error: null };
  } catch (err) {
    console.error("deleteLeadDocument error:", err);
    return { error: "Failed to delete document." };
  }
}

// ============================================================
// Get a signed download URL for a document
// ============================================================

export async function getDocumentDownloadUrl(
  storagePath: string
): Promise<{ data: string | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.storage
      .from("lead-documents")
      .createSignedUrl(storagePath, 3600); // 1 hour

    if (error || !data?.signedUrl) {
      return { data: null, error: error?.message ?? "Failed to generate download URL." };
    }

    return { data: data.signedUrl, error: null };
  } catch (err) {
    console.error("getDocumentDownloadUrl error:", err);
    return { data: null, error: "Failed to generate download URL." };
  }
}
