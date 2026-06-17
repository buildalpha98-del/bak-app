"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { FormField, FormTemplate, FormSubmission } from "@/lib/types/database";

// ============================================================
// Archive convention
// ============================================================
//
// `form_templates` has no `status` column (see migration 003).
// We encode archive state via a `[Archived] ` prefix on the
// template `name`. The prefix is idempotent: bulk-archiving a
// template that already has it is a no-op (no DB write).
// Publishing strips the prefix back off. The forms list filters
// on this prefix to derive draft / published / archived views.

const ARCHIVED_PREFIX = "[Archived] ";

function isArchivedName(name: string): boolean {
  return name.startsWith(ARCHIVED_PREFIX);
}

function unarchivedName(name: string): string {
  if (!isArchivedName(name)) return name;
  return name.slice(ARCHIVED_PREFIX.length);
}

function archivedName(name: string): string {
  if (isArchivedName(name)) return name;
  return ARCHIVED_PREFIX + name;
}

// ============================================================
// Admin-or-ops role gate (mirrors training/actions.ts pattern)
// ============================================================

async function requireAdminOrOps(): Promise<
  | { ok: true; userId: string; role: "admin" | "ops" }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { ok: false, error: "Not authorised." };
  }

  return { ok: true, userId: user.id, role: profile.role };
}

// ============================================================
// Types
// ============================================================

export interface FormTemplateListItem extends FormTemplate {
  field_count: number;
  centre_name: string | null;
  created_by_name: string | null;
}

export interface FormSubmissionListItem extends FormSubmission {
  template_name: string;
  form_type: string;
  coach_name: string;
  centre_name: string | null;
  session_date: string | null;
}

export interface CreateTemplateInput {
  name: string;
  formType: string;
  fieldsJson: FormField[];
  isDefault: boolean;
  centreId: string | null;
}

export interface UpdateTemplateInput {
  name?: string;
  fieldsJson?: FormField[];
  centreId?: string | null;
}

export interface SubmitFormInput {
  formTemplateId: string;
  sessionId: string | null;
  dataJson: Record<string, unknown>;
  attachments: string[];
}

export interface SubmissionFilters {
  formType?: string;
  coachId?: string;
  centreId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ============================================================
// Template CRUD
// ============================================================

export async function getFormTemplates(): Promise<{
  data: FormTemplateListItem[] | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: templates, error } = await supabase
    .from("form_templates")
    .select("*")
    .order("form_type", { ascending: true })
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) return { data: null, error: error.message };

  const enriched: FormTemplateListItem[] = [];
  for (const t of templates ?? []) {
    let centreName: string | null = null;
    if (t.centre_id) {
      const { data: centre } = await supabase
        .from("centres")
        .select("name")
        .eq("id", t.centre_id)
        .single();
      centreName = centre?.name ?? null;
    }

    let createdByName: string | null = null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", t.created_by)
      .single();
    createdByName = profile?.name ?? null;

    const fields = (t.fields_json as FormField[]) ?? [];

    enriched.push({
      ...t,
      fields_json: fields,
      field_count: fields.filter((f: FormField) => !f.locked).length,
      centre_name: centreName,
      created_by_name: createdByName,
    });
  }

  return { data: enriched, error: null };
}

export async function getFormTemplateById(
  id: string
): Promise<{ data: FormTemplate | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("form_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as FormTemplate, error: null };
}

export async function createFormTemplate(
  input: CreateTemplateInput
): Promise<{ data: FormTemplate | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("form_templates")
    .insert({
      name: input.name.trim(),
      form_type: input.formType,
      fields_json: input.fieldsJson,
      is_default: input.isDefault,
      centre_id: input.centreId,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "form_template_created",
    entity_type: "form_template",
    entity_id: data.id,
    metadata: { name: input.name, form_type: input.formType },
  });

  return { data: data as FormTemplate, error: null };
}

export async function updateFormTemplate(
  id: string,
  input: UpdateTemplateInput
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.fieldsJson !== undefined) updates.fields_json = input.fieldsJson;
  if (input.centreId !== undefined) updates.centre_id = input.centreId;

  const { error } = await supabase
    .from("form_templates")
    .update(updates)
    .eq("id", id);

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "form_template_updated",
    entity_type: "form_template",
    entity_id: id,
    metadata: updates,
  });

  return { error: null };
}

export async function deleteFormTemplate(
  id: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Check role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Only admin can delete templates." };

  // Don't allow deleting default templates
  const { data: template } = await supabase
    .from("form_templates")
    .select("is_default")
    .eq("id", id)
    .single();
  if (template?.is_default) return { error: "Cannot delete default templates." };

  // Check if any submissions exist
  const { count } = await supabase
    .from("form_submissions")
    .select("*", { count: "exact", head: true })
    .eq("form_template_id", id);
  if ((count ?? 0) > 0) {
    return { error: "Cannot delete template with existing submissions." };
  }

  const { error } = await supabase
    .from("form_templates")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "form_template_deleted",
    entity_type: "form_template",
    entity_id: id,
  });

  return { error: null };
}

export async function duplicateTemplate(
  templateId: string,
  centreId: string | null,
  newName?: string
): Promise<{ data: FormTemplate | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: original } = await supabase
    .from("form_templates")
    .select("*")
    .eq("id", templateId)
    .single();
  if (!original) return { data: null, error: "Template not found." };

  const name = newName?.trim() || `${original.name} (Copy)`;

  const { data, error } = await supabase
    .from("form_templates")
    .insert({
      name,
      form_type: original.form_type,
      fields_json: original.fields_json,
      is_default: false,
      centre_id: centreId,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as FormTemplate, error: null };
}

// ============================================================
// Form Submission
// ============================================================

export async function submitForm(
  input: SubmitFormInput
): Promise<{ data: FormSubmission | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("form_submissions")
    .insert({
      form_template_id: input.formTemplateId,
      session_id: input.sessionId,
      submitted_by: user.id,
      data_json: input.dataJson,
      attachments: input.attachments,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "form_submitted",
    entity_type: "form_submission",
    entity_id: data.id,
    metadata: {
      form_template_id: input.formTemplateId,
      session_id: input.sessionId,
    },
  });

  return { data: data as FormSubmission, error: null };
}

export async function getFormSubmissions(
  filters?: SubmissionFilters
): Promise<{ data: FormSubmissionListItem[] | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  let query = supabase
    .from("form_submissions")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(200);

  if (filters?.dateFrom) {
    query = query.gte("submitted_at", filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte("submitted_at", `${filters.dateTo}T23:59:59`);
  }
  if (filters?.coachId) {
    query = query.eq("submitted_by", filters.coachId);
  }

  const { data: submissions, error } = await query;
  if (error) return { data: null, error: error.message };

  const enriched: FormSubmissionListItem[] = [];
  for (const s of submissions ?? []) {
    // Get template info
    const { data: template } = await supabase
      .from("form_templates")
      .select("name, form_type")
      .eq("id", s.form_template_id)
      .single();

    // Filter by form type at app level (template join)
    if (filters?.formType && template?.form_type !== filters.formType) continue;

    // Get coach name
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", s.submitted_by)
      .single();

    // Get session + centre info
    let centreName: string | null = null;
    let sessionDate: string | null = null;
    if (s.session_id) {
      const { data: session } = await supabase
        .from("sessions")
        .select("date, centre_id")
        .eq("id", s.session_id)
        .single();
      sessionDate = session?.date ?? null;

      if (session?.centre_id) {
        const { data: centre } = await supabase
          .from("centres")
          .select("name")
          .eq("id", session.centre_id)
          .single();
        centreName = centre?.name ?? null;

        // Filter by centre
        if (filters?.centreId && session.centre_id !== filters.centreId) continue;
      }
    }

    enriched.push({
      ...s,
      template_name: template?.name ?? "Unknown",
      form_type: template?.form_type ?? "unknown",
      coach_name: profile?.name ?? "Unknown",
      centre_name: centreName,
      session_date: sessionDate,
    });
  }

  return { data: enriched, error: null };
}

export async function getCoachSubmissions(): Promise<{
  data: FormSubmissionListItem[] | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  return getFormSubmissions({ coachId: user.id });
}

export async function getSubmissionById(
  id: string
): Promise<{ data: FormSubmissionListItem | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: s, error } = await supabase
    .from("form_submissions")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !s) return { data: null, error: error?.message ?? "Not found" };

  const { data: template } = await supabase
    .from("form_templates")
    .select("name, form_type")
    .eq("id", s.form_template_id)
    .single();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", s.submitted_by)
    .single();

  let centreName: string | null = null;
  let sessionDate: string | null = null;
  if (s.session_id) {
    const { data: session } = await supabase
      .from("sessions")
      .select("date, centre_id")
      .eq("id", s.session_id)
      .single();
    sessionDate = session?.date ?? null;
    if (session?.centre_id) {
      const { data: centre } = await supabase
        .from("centres")
        .select("name")
        .eq("id", session.centre_id)
        .single();
      centreName = centre?.name ?? null;
    }
  }

  return {
    data: {
      ...s,
      template_name: template?.name ?? "Unknown",
      form_type: template?.form_type ?? "unknown",
      coach_name: profile?.name ?? "Unknown",
      centre_name: centreName,
      session_date: sessionDate,
    },
    error: null,
  };
}

// Upload form attachment to Supabase Storage
export async function uploadFormAttachment(
  formData: FormData,
  sessionId: string | null,
  formType: string
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { url: null, error: "Not authenticated" };

  const file = formData.get("file") as File | null;
  if (!file) return { url: null, error: "No file provided" };

  // Validate
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) return { url: null, error: "File too large (max 5MB)" };

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "application/pdf",
  ];
  if (!allowedTypes.includes(file.type)) {
    return { url: null, error: "Invalid file type" };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const prefix = sessionId ?? "standalone";
  const path = `${prefix}/${formType}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from("form-attachments")
    .upload(path, file);

  if (error) return { url: null, error: error.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("form-attachments").getPublicUrl(path);

  return { url: publicUrl, error: null };
}

/**
 * Get the correct template for a session — respects centre-specific overrides.
 */
export async function getTemplateForSession(
  formType: string,
  centreId: string | null
): Promise<{ data: FormTemplate | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // First try centre-specific template
  if (centreId) {
    const { data: centreTemplate } = await supabase
      .from("form_templates")
      .select("*")
      .eq("form_type", formType)
      .eq("centre_id", centreId)
      .limit(1)
      .maybeSingle();

    if (centreTemplate) {
      return { data: centreTemplate as FormTemplate, error: null };
    }
  }

  // Fall back to default template
  const { data: defaultTemplate, error } = await supabase
    .from("form_templates")
    .select("*")
    .eq("form_type", formType)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: defaultTemplate as FormTemplate | null, error: null };
}

/**
 * Get available templates for a coach (defaults + centre-specific for their centres)
 */
export async function getCoachAvailableTemplates(): Promise<{
  data: FormTemplateListItem[] | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Get default templates
  const { data: templates, error } = await supabase
    .from("form_templates")
    .select("*")
    .or("is_default.eq.true,centre_id.is.null")
    .order("form_type", { ascending: true });

  if (error) return { data: null, error: error.message };

  const enriched: FormTemplateListItem[] = (templates ?? []).map((t) => {
    const fields = (t.fields_json as FormField[]) ?? [];
    return {
      ...t,
      fields_json: fields,
      field_count: fields.filter((f: FormField) => !f.locked).length,
      centre_name: null,
      created_by_name: null,
    };
  });

  return { data: enriched, error: null };
}

// ============================================================
// Lookup helpers
// ============================================================

export async function getCoachesForFilter(): Promise<{
  data: { id: string; name: string }[] | null;
  error: string | null;
}> {
  // Use admin client — reference data all authenticated users should see
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("role", "coach")
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };
  return {
    data: (data ?? []).map((p) => ({ id: p.id, name: p.name ?? "Unknown" })),
    error: null,
  };
}

export async function getCentresForFilter(): Promise<{
  data: { id: string; name: string }[] | null;
  error: string | null;
}> {
  // Use admin client — reference data all authenticated users should see
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("centres")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };
  return {
    data: (data ?? []).map((c) => ({ id: c.id, name: c.name })),
    error: null,
  };
}

// ============================================================
// getSubmissionCountsByTemplate
// ============================================================
//
// Returns a `Record<templateId, count>` lookup so the list view
// can show "N submissions" per row without firing one query
// per template card. Single aggregation pass.

export async function getSubmissionCountsByTemplate(): Promise<{
  data: Record<string, number>;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: {}, error: "Not authenticated" };

  const { data: rows, error } = await supabase
    .from("form_submissions")
    .select("form_template_id");

  if (error) return { data: {}, error: error.message };

  const counts: Record<string, number> = {};
  for (const row of rows ?? []) {
    const r = row as { form_template_id: string };
    counts[r.form_template_id] = (counts[r.form_template_id] ?? 0) + 1;
  }
  return { data: counts, error: null };
}

// ============================================================
// bulkPublishTemplates
// ============================================================
//
// `form_templates` has no `status` column. "Publishing" means
// stripping the `[Archived] ` name prefix (if present). On a
// template that was never archived this is a no-op write. Per-id
// errors don't sink the batch.

export async function bulkPublishTemplates(
  ids: string[],
): Promise<{
  published: number;
  errors: { id: string; error: string }[];
  error: string | null;
}> {
  if (!ids.length) {
    return { published: 0, errors: [], error: "No templates selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { published: 0, errors: [], error: gate.error };
  }

  const supabase = await createSupabaseServerClient();

  // Load current names — we only need to strip the prefix where
  // it actually exists. Skips an unnecessary update otherwise.
  const { data: templates, error: fetchError } = await supabase
    .from("form_templates")
    .select("id, name")
    .in("id", ids);
  if (fetchError) {
    return { published: 0, errors: [], error: fetchError.message };
  }

  const errors: { id: string; error: string }[] = [];
  let published = 0;

  for (const t of templates ?? []) {
    const row = t as { id: string; name: string };
    const newName = unarchivedName(row.name);

    if (newName === row.name) {
      // Already published (no [Archived] prefix). Still count it
      // and log so the activity feed reflects the intent.
      published += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "form_template_bulk_published",
        entity_type: "form_template",
        entity_id: row.id,
        metadata: { name: row.name, no_op: true },
      });
      continue;
    }

    const { error } = await supabase
      .from("form_templates")
      .update({ name: newName })
      .eq("id", row.id);
    if (error) {
      errors.push({ id: row.id, error: error.message });
    } else {
      published += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "form_template_bulk_published",
        entity_type: "form_template",
        entity_id: row.id,
        metadata: { name: newName },
      });
    }
  }

  revalidatePath("/admin/forms");
  revalidatePath("/ops/forms");

  return {
    published,
    errors,
    error:
      errors.length && published === 0
        ? "Failed to publish templates."
        : errors.length
          ? "Some templates failed to publish."
          : null,
  };
}

// ============================================================
// bulkArchiveTemplates
// ============================================================
//
// Adds the `[Archived] ` prefix to each selected template's name.
// Idempotent — a template that already has the prefix counts as
// archived without a DB write. Existing submissions stay intact;
// archival only hides the template from the active library.

export async function bulkArchiveTemplates(
  ids: string[],
): Promise<{
  archived: number;
  errors: { id: string; error: string }[];
  error: string | null;
}> {
  if (!ids.length) {
    return { archived: 0, errors: [], error: "No templates selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { archived: 0, errors: [], error: gate.error };
  }

  const supabase = await createSupabaseServerClient();

  const { data: templates, error: fetchError } = await supabase
    .from("form_templates")
    .select("id, name, is_default")
    .in("id", ids);
  if (fetchError) {
    return { archived: 0, errors: [], error: fetchError.message };
  }

  const errors: { id: string; error: string }[] = [];
  let archived = 0;

  for (const t of templates ?? []) {
    const row = t as { id: string; name: string; is_default: boolean };
    if (row.is_default) {
      errors.push({
        id: row.id,
        error: "Cannot archive a default template.",
      });
      continue;
    }
    const newName = archivedName(row.name);
    if (newName === row.name) {
      // Already archived — no-op DB write but still counts.
      archived += 1;
      continue;
    }

    const { error } = await supabase
      .from("form_templates")
      .update({ name: newName })
      .eq("id", row.id);
    if (error) {
      errors.push({ id: row.id, error: error.message });
    } else {
      archived += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "form_template_bulk_archived",
        entity_type: "form_template",
        entity_id: row.id,
        metadata: { name: newName },
      });
    }
  }

  revalidatePath("/admin/forms");
  revalidatePath("/ops/forms");

  return {
    archived,
    errors,
    error:
      errors.length && archived === 0
        ? "Failed to archive templates."
        : errors.length
          ? "Some templates failed to archive."
          : null,
  };
}

// ============================================================
// bulkDuplicateTemplates
// ============================================================
//
// For each selected template, create a new template that mirrors
// the original (fields, form_type) under "(Copy)" naming and
// scoped globally (centre_id = null). Per-id errors don't sink
// the batch. Activity log per-id.

export async function bulkDuplicateTemplates(
  ids: string[],
): Promise<{
  duplicated: number;
  errors: { id: string; error: string }[];
  error: string | null;
}> {
  if (!ids.length) {
    return { duplicated: 0, errors: [], error: "No templates selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { duplicated: 0, errors: [], error: gate.error };
  }

  const supabase = await createSupabaseServerClient();

  const { data: templates, error: fetchError } = await supabase
    .from("form_templates")
    .select("id, name, form_type, fields_json")
    .in("id", ids);
  if (fetchError) {
    return { duplicated: 0, errors: [], error: fetchError.message };
  }

  const errors: { id: string; error: string }[] = [];
  let duplicated = 0;

  for (const t of templates ?? []) {
    const row = t as {
      id: string;
      name: string;
      form_type: string;
      fields_json: FormField[];
    };
    const newName = `${unarchivedName(row.name)} (Copy)`;

    const { data: inserted, error } = await supabase
      .from("form_templates")
      .insert({
        name: newName,
        form_type: row.form_type,
        fields_json: row.fields_json,
        is_default: false,
        centre_id: null,
        created_by: gate.userId,
      })
      .select("id")
      .single();
    if (error) {
      errors.push({ id: row.id, error: error.message });
    } else {
      duplicated += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "form_template_bulk_duplicated",
        entity_type: "form_template",
        entity_id: (inserted as { id: string }).id,
        metadata: { source_id: row.id, name: newName },
      });
    }
  }

  revalidatePath("/admin/forms");
  revalidatePath("/ops/forms");

  return {
    duplicated,
    errors,
    error:
      errors.length && duplicated === 0
        ? "Failed to duplicate templates."
        : errors.length
          ? "Some templates failed to duplicate."
          : null,
  };
}

// ============================================================
// exportTemplatesCsv
// ============================================================
//
// Returns a CSV string of the selected templates. Columns:
// Name, Type, Field count (excluding locked auto-populated
// fields), Default, Centre, Created.

export async function exportTemplatesCsv(
  ids: string[],
): Promise<{ csv: string | null; error: string | null }> {
  if (!ids.length) {
    return { csv: null, error: "No templates selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { csv: null, error: gate.error };
  }

  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("form_templates")
    .select("id, name, form_type, fields_json, is_default, centre_id, created_at")
    .in("id", ids);
  if (error) return { csv: null, error: error.message };

  // Fetch centre names in one pass for the CSV "Centre" column.
  const centreIds = Array.from(
    new Set(
      (rows ?? [])
        .map((r) => (r as { centre_id: string | null }).centre_id)
        .filter((id): id is string => !!id),
    ),
  );
  const centreNames = new Map<string, string>();
  if (centreIds.length > 0) {
    const { data: centres } = await supabase
      .from("centres")
      .select("id, name")
      .in("id", centreIds);
    for (const c of centres ?? []) {
      const cr = c as { id: string; name: string };
      centreNames.set(cr.id, cr.name);
    }
  }

  const header = [
    "Name",
    "Type",
    "Field count",
    "Default",
    "Centre",
    "Created",
  ];

  function escape(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  const lines: string[] = [header.map(escape).join(",")];
  for (const row of rows ?? []) {
    const r = row as {
      name: string;
      form_type: string;
      fields_json: FormField[] | null;
      is_default: boolean;
      centre_id: string | null;
      created_at: string;
    };
    const fieldCount = (r.fields_json ?? []).filter(
      (f: FormField) => !f.locked,
    ).length;
    const centre = r.centre_id ? (centreNames.get(r.centre_id) ?? "") : "";
    lines.push(
      [
        escape(r.name),
        escape(r.form_type),
        escape(String(fieldCount)),
        escape(r.is_default ? "Yes" : "No"),
        escape(centre),
        escape(r.created_at.slice(0, 10)),
      ].join(","),
    );
  }

  await supabase.from("activity_log").insert({
    user_id: gate.userId,
    action: "form_templates_exported_csv",
    entity_type: "form_template",
    entity_id: ids[0],
    metadata: { count: ids.length },
  });

  return { csv: lines.join("\n"), error: null };
}
