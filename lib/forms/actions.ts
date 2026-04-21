"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { FormField, FormTemplate, FormSubmission } from "@/lib/types/database";

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
