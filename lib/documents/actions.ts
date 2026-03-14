"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Document } from "@/lib/types/database";
import type { DocumentCategory, DocumentVisibility } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

export interface DocumentListItem {
  id: string;
  title: string;
  category: DocumentCategory;
  file_url: string;
  file_name: string;
  tags: string[];
  version: number;
  parent_document_id: string | null;
  uploaded_by: string;
  uploaded_by_name: string | null;
  visibility: DocumentVisibility;
  created_at: string;
  offline_available: boolean;
  source_entity_type: string | null;
  source_entity_id: string | null;
}

export interface UploadDocumentInput {
  title: string;
  category: DocumentCategory;
  tags: string[];
  visibility: DocumentVisibility;
}

export interface DocumentVersionItem {
  id: string;
  version: number;
  file_name: string;
  uploaded_by_name: string | null;
  created_at: string;
}

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// ============================================================
// 1. uploadDocument — upload file + create record
// ============================================================

export async function uploadDocument(
  formData: FormData
): Promise<{ data: Document | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const file = formData.get("file") as File | null;
    if (!file) return { data: null, error: "No file provided." };

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        data: null,
        error:
          "Invalid file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, JPEG, PNG, WebP.",
      };
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return { data: null, error: "File too large. Maximum 25MB." };
    }

    // Parse metadata from form
    const title = (formData.get("title") as string) || file.name;
    const category = (formData.get("category") as DocumentCategory) || "other";
    const tagsRaw = formData.get("tags") as string;
    const tags: string[] = tagsRaw ? JSON.parse(tagsRaw) : [];
    const visibility =
      (formData.get("visibility") as DocumentVisibility) || "all";

    // Upload to Supabase Storage
    const ext = file.name.split(".").pop() ?? "pdf";
    const sanitisedCategory = category.replace(/_/g, "-");
    const path = `${sanitisedCategory}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(path, file);

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("documents").getPublicUrl(path);

    // Create record
    const { data, error } = await supabase
      .from("documents")
      .insert({
        title,
        category,
        file_url: publicUrl,
        file_name: file.name,
        tags,
        version: 1,
        parent_document_id: null,
        uploaded_by: user.id,
        visibility,
      })
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "document_uploaded",
      entity_type: "document",
      entity_id: data.id,
      metadata: { category, file_name: file.name },
    });

    return { data: data as Document, error: null };
  } catch (err) {
    console.error("uploadDocument error:", err);
    return { data: null, error: "Failed to upload document." };
  }
}

// ============================================================
// 2. uploadNewVersion — new file for existing document
// ============================================================

export async function uploadNewVersion(
  parentDocumentId: string,
  formData: FormData
): Promise<{ data: Document | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const file = formData.get("file") as File | null;
    if (!file) return { data: null, error: "No file provided." };

    if (!ALLOWED_TYPES.includes(file.type)) {
      return { data: null, error: "Invalid file type." };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { data: null, error: "File too large. Maximum 25MB." };
    }

    // Get root document and max version
    const { data: parent, error: parentErr } = await supabase
      .from("documents")
      .select("id, title, category, tags, visibility, parent_document_id")
      .eq("id", parentDocumentId)
      .single();

    if (parentErr) throw parentErr;

    const rootId = parent.parent_document_id ?? parentDocumentId;

    // Get max version in chain
    const { data: versions } = await supabase
      .from("documents")
      .select("version")
      .or(`id.eq.${rootId},parent_document_id.eq.${rootId}`)
      .order("version", { ascending: false })
      .limit(1);

    const maxVersion = versions?.[0]?.version ?? 1;

    // Upload file
    const sanitisedCategory = parent.category.replace(/_/g, "-");
    const path = `${sanitisedCategory}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(path, file);

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("documents").getPublicUrl(path);

    const { data, error } = await supabase
      .from("documents")
      .insert({
        title: parent.title,
        category: parent.category,
        file_url: publicUrl,
        file_name: file.name,
        tags: parent.tags ?? [],
        version: maxVersion + 1,
        parent_document_id: rootId,
        uploaded_by: user.id,
        visibility: parent.visibility,
      })
      .select()
      .single();

    if (error) throw error;

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "document_version_uploaded",
      entity_type: "document",
      entity_id: data.id,
      metadata: { parent_id: rootId, version: maxVersion + 1 },
    });

    return { data: data as Document, error: null };
  } catch (err) {
    console.error("uploadNewVersion error:", err);
    return { data: null, error: "Failed to upload new version." };
  }
}

// ============================================================
// 3. getDocuments — list with filters
// ============================================================

export async function getDocuments(opts?: {
  category?: DocumentCategory;
  limit?: number;
}): Promise<{ data: DocumentListItem[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    let query = supabase
      .from("documents")
      .select(
        "id, title, category, file_url, file_name, tags, version, parent_document_id, uploaded_by, visibility, created_at, profiles:uploaded_by(name)"
      )
      .order("created_at", { ascending: false });

    if (opts?.category) {
      query = query.eq("category", opts.category);
    }

    if (opts?.limit) {
      query = query.limit(opts.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    const mapped: DocumentListItem[] = (data ?? []).map(
      (r: Record<string, unknown>) => {
        const profile = r.profiles as unknown as Record<string, unknown> | null;
        return {
          id: r.id as string,
          title: r.title as string,
          category: r.category as DocumentCategory,
          file_url: r.file_url as string,
          file_name: r.file_name as string,
          tags: (r.tags as string[]) ?? [],
          version: r.version as number,
          parent_document_id: r.parent_document_id as string | null,
          uploaded_by: r.uploaded_by as string,
          uploaded_by_name: (profile?.name as string) ?? null,
          visibility: r.visibility as DocumentVisibility,
          created_at: r.created_at as string,
          offline_available: false, // TODO: add column when needed
          source_entity_type: null,
          source_entity_id: null,
        };
      }
    );

    return { data: mapped, error: null };
  } catch (err) {
    console.error("getDocuments error:", err);
    return { data: null, error: "Failed to fetch documents." };
  }
}

// ============================================================
// 4. getDocumentById
// ============================================================

export async function getDocumentById(
  id: string
): Promise<{ data: DocumentListItem | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("documents")
      .select(
        "id, title, category, file_url, file_name, tags, version, parent_document_id, uploaded_by, visibility, created_at, profiles:uploaded_by(name)"
      )
      .eq("id", id)
      .single();

    if (error) throw error;

    const profile = data.profiles as unknown as Record<string, unknown> | null;

    return {
      data: {
        id: data.id,
        title: data.title,
        category: data.category as DocumentCategory,
        file_url: data.file_url,
        file_name: data.file_name,
        tags: data.tags ?? [],
        version: data.version,
        parent_document_id: data.parent_document_id,
        uploaded_by: data.uploaded_by,
        uploaded_by_name: (profile?.name as string) ?? null,
        visibility: data.visibility as DocumentVisibility,
        created_at: data.created_at,
        offline_available: false,
        source_entity_type: null,
        source_entity_id: null,
      },
      error: null,
    };
  } catch (err) {
    console.error("getDocumentById error:", err);
    return { data: null, error: "Failed to fetch document." };
  }
}

// ============================================================
// 5. getDocumentVersionHistory
// ============================================================

export async function getDocumentVersionHistory(
  documentId: string
): Promise<{ data: DocumentVersionItem[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, parent_document_id")
      .eq("id", documentId)
      .single();

    if (docErr) throw docErr;

    const rootId = doc.parent_document_id ?? doc.id;

    const { data, error } = await supabase
      .from("documents")
      .select(
        "id, version, file_name, created_at, uploaded_by, profiles:uploaded_by(name)"
      )
      .or(`id.eq.${rootId},parent_document_id.eq.${rootId}`)
      .order("version", { ascending: true });

    if (error) throw error;

    const versions: DocumentVersionItem[] = (data ?? []).map(
      (r: Record<string, unknown>) => {
        const profile = r.profiles as unknown as Record<string, unknown> | null;
        return {
          id: r.id as string,
          version: r.version as number,
          file_name: r.file_name as string,
          uploaded_by_name: (profile?.name as string) ?? null,
          created_at: r.created_at as string,
        };
      }
    );

    return { data: versions, error: null };
  } catch (err) {
    console.error("getDocumentVersionHistory error:", err);
    return { data: null, error: "Failed to fetch version history." };
  }
}

// ============================================================
// 6. updateDocument — edit title, tags, visibility
// ============================================================

export async function updateDocument(
  id: string,
  updates: {
    title?: string;
    tags?: string[];
    visibility?: DocumentVisibility;
  }
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase
      .from("documents")
      .update(updates)
      .eq("id", id);

    if (error) throw error;

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "document_updated",
      entity_type: "document",
      entity_id: id,
      metadata: updates,
    });

    return { error: null };
  } catch (err) {
    console.error("updateDocument error:", err);
    return { error: "Failed to update document." };
  }
}

// ============================================================
// 7. deleteDocument — admin only
// ============================================================

export async function deleteDocument(
  id: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Verify admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return { error: "Only admins can delete documents." };
    }

    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) throw error;

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "document_deleted",
      entity_type: "document",
      entity_id: id,
    });

    return { error: null };
  } catch (err) {
    console.error("deleteDocument error:", err);
    return { error: "Failed to delete document." };
  }
}

// ============================================================
// 8. autoFileDocument — create document record from entity
// ============================================================

export async function autoFileDocument(opts: {
  title: string;
  category: DocumentCategory;
  fileUrl: string;
  fileName: string;
  visibility: DocumentVisibility;
  sourceEntityType: string;
  sourceEntityId: string;
  userId: string;
}): Promise<{ data: Document | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("documents")
      .insert({
        title: opts.title,
        category: opts.category,
        file_url: opts.fileUrl,
        file_name: opts.fileName,
        tags: [],
        version: 1,
        parent_document_id: null,
        uploaded_by: opts.userId,
        visibility: opts.visibility,
      })
      .select()
      .single();

    if (error) throw error;

    return { data: data as Document, error: null };
  } catch (err) {
    console.error("autoFileDocument error:", err);
    return { data: null, error: "Failed to auto-file document." };
  }
}

// ============================================================
// 9. getCategoryCounts — for sidebar badges
// ============================================================

export async function getCategoryCounts(): Promise<{
  data: Record<string, number> | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("documents")
      .select("category");

    if (error) throw error;

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.category] = (counts[row.category] ?? 0) + 1;
    }

    return { data: counts, error: null };
  } catch (err) {
    console.error("getCategoryCounts error:", err);
    return { data: null, error: "Failed to count documents." };
  }
}
