"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EmailSequence, EmailSequenceStep, EmailSend } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface SequenceWithSteps extends EmailSequence {
  steps: EmailSequenceStep[];
  step_count: number;
}

export interface LeadSequenceStatus {
  sequence: EmailSequence;
  steps: (EmailSequenceStep & { send?: EmailSend })[];
  currentStep: number;
  isPaused: boolean;
}

// ============================================================
// List sequences
// ============================================================

export async function getSequences(): Promise<{
  data: SequenceWithSteps[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("email_sequences")
      .select("*, email_sequence_steps(count)")
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: error.message };

    // Get steps for each
    const sequences: SequenceWithSteps[] = [];
    for (const seq of data ?? []) {
      const { data: steps } = await supabase
        .from("email_sequence_steps")
        .select("*")
        .eq("sequence_id", seq.id)
        .order("step_number");

      const stepsArr = steps ?? [];
      sequences.push({
        ...seq,
        steps: stepsArr,
        step_count: stepsArr.length,
        email_sequence_steps: undefined,
      } as SequenceWithSteps);
    }

    return { data: sequences, error: null };
  } catch (err) {
    console.error("getSequences error:", err);
    return { data: [], error: "Failed to load sequences." };
  }
}

// ============================================================
// Get sequence detail
// ============================================================

export async function getSequenceDetail(
  sequenceId: string
): Promise<{ data: SequenceWithSteps | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: seq, error } = await supabase
      .from("email_sequences")
      .select("*")
      .eq("id", sequenceId)
      .single();

    if (error || !seq) return { data: null, error: error?.message ?? "Not found." };

    const { data: steps } = await supabase
      .from("email_sequence_steps")
      .select("*")
      .eq("sequence_id", sequenceId)
      .order("step_number");

    return {
      data: {
        ...seq,
        steps: steps ?? [],
        step_count: steps?.length ?? 0,
      } as SequenceWithSteps,
      error: null,
    };
  } catch (err) {
    console.error("getSequenceDetail error:", err);
    return { data: null, error: "Failed to load sequence." };
  }
}

// ============================================================
// Create sequence
// ============================================================

export async function createSequence(input: {
  name: string;
  description?: string;
  trigger_stage: string;
}): Promise<{ data: EmailSequence | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("email_sequences")
      .insert({
        name: input.name,
        description: input.description ?? null,
        trigger_stage: input.trigger_stage,
        created_by: user?.id ?? null,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    revalidatePath("/admin/crm/sequences");
    return { data, error: null };
  } catch (err) {
    console.error("createSequence error:", err);
    return { data: null, error: "Failed to create sequence." };
  }
}

// ============================================================
// Update sequence
// ============================================================

export async function updateSequence(
  sequenceId: string,
  updates: Partial<Pick<EmailSequence, "name" | "description" | "trigger_stage" | "is_active">>
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("email_sequences")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", sequenceId);

    if (error) return { error: error.message };

    revalidatePath("/admin/crm/sequences");
    return { error: null };
  } catch (err) {
    console.error("updateSequence error:", err);
    return { error: "Failed to update sequence." };
  }
}

// ============================================================
// Add/update/remove steps
// ============================================================

export async function upsertStep(
  sequenceId: string,
  step: {
    id?: string;
    step_number: number;
    delay_days: number;
    subject: string;
    body: string;
  }
): Promise<{ data: EmailSequenceStep | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    if (step.id) {
      const { data, error } = await supabase
        .from("email_sequence_steps")
        .update({
          step_number: step.step_number,
          delay_days: step.delay_days,
          subject: step.subject,
          body: step.body,
        })
        .eq("id", step.id)
        .select()
        .single();

      if (error) return { data: null, error: error.message };
      return { data, error: null };
    } else {
      const { data, error } = await supabase
        .from("email_sequence_steps")
        .insert({
          sequence_id: sequenceId,
          step_number: step.step_number,
          delay_days: step.delay_days,
          subject: step.subject,
          body: step.body,
        })
        .select()
        .single();

      if (error) return { data: null, error: error.message };
      return { data, error: null };
    }
  } catch (err) {
    console.error("upsertStep error:", err);
    return { data: null, error: "Failed to save step." };
  }
}

export async function deleteStep(stepId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("email_sequence_steps")
      .delete()
      .eq("id", stepId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("deleteStep error:", err);
    return { error: "Failed to delete step." };
  }
}

// ============================================================
// Sequence controls for leads
// ============================================================

export async function pauseSequence(leadId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("leads")
      .update({ sequence_paused: true, updated_at: new Date().toISOString() })
      .eq("id", leadId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("pauseSequence error:", err);
    return { error: "Failed to pause." };
  }
}

export async function resumeSequence(leadId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("leads")
      .update({ sequence_paused: false, updated_at: new Date().toISOString() })
      .eq("id", leadId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("resumeSequence error:", err);
    return { error: "Failed to resume." };
  }
}

export async function stopSequence(leadId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Clear active sequence
    const { error } = await supabase
      .from("leads")
      .update({
        active_sequence_id: null,
        sequence_paused: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (error) return { error: error.message };

    // Skip any pending scheduled sends
    await supabase
      .from("email_sends")
      .update({ status: "skipped" })
      .eq("lead_id", leadId)
      .eq("status", "scheduled");

    return { error: null };
  } catch (err) {
    console.error("stopSequence error:", err);
    return { error: "Failed to stop." };
  }
}

export async function skipNextStep(leadId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Find next scheduled send
    const { data: nextSend } = await supabase
      .from("email_sends")
      .select("id")
      .eq("lead_id", leadId)
      .eq("status", "scheduled")
      .order("scheduled_for", { ascending: true })
      .limit(1)
      .single();

    if (!nextSend) return { error: "No pending steps to skip." };

    const { error } = await supabase
      .from("email_sends")
      .update({ status: "skipped" })
      .eq("id", nextSend.id);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("skipNextStep error:", err);
    return { error: "Failed to skip." };
  }
}

// ============================================================
// Get lead's sequence status
// ============================================================

export async function getLeadSequenceStatus(
  leadId: string
): Promise<{ data: LeadSequenceStatus | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: lead } = await supabase
      .from("leads")
      .select("active_sequence_id, sequence_paused")
      .eq("id", leadId)
      .single();

    if (!lead?.active_sequence_id) return { data: null, error: null };

    const { data: sequence } = await supabase
      .from("email_sequences")
      .select("*")
      .eq("id", lead.active_sequence_id)
      .single();

    if (!sequence) return { data: null, error: null };

    const { data: steps } = await supabase
      .from("email_sequence_steps")
      .select("*")
      .eq("sequence_id", sequence.id)
      .order("step_number");

    const { data: sends } = await supabase
      .from("email_sends")
      .select("*")
      .eq("lead_id", leadId)
      .eq("sequence_id", sequence.id)
      .order("scheduled_for");

    const sendMap = new Map<string, EmailSend>();
    for (const send of sends ?? []) {
      sendMap.set(send.step_id, send);
    }

    const stepsWithSends = (steps ?? []).map((step) => ({
      ...step,
      send: sendMap.get(step.id),
    }));

    const sentCount = (sends ?? []).filter((s) => s.status !== "scheduled" && s.status !== "skipped").length;

    return {
      data: {
        sequence: sequence as EmailSequence,
        steps: stepsWithSends,
        currentStep: sentCount + 1,
        isPaused: lead.sequence_paused ?? false,
      },
      error: null,
    };
  } catch (err) {
    console.error("getLeadSequenceStatus error:", err);
    return { data: null, error: "Failed to load status." };
  }
}
