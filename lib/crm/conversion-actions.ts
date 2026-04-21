"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { changeLeadStage } from "@/lib/crm/actions";
import { triggerNotificationForOps } from "@/lib/notifications/send";

// ============================================================
// Convert a won lead into a centre (school or childcare)
// ============================================================

export async function convertLeadToCustomer(input: {
  leadId: string;
  agreedRate?: number;
}): Promise<{
  data: { centreId: string } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // 1. Get lead record
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", input.leadId)
      .single();

    if (leadError || !lead) {
      return { data: null, error: leadError?.message ?? "Lead not found." };
    }

    if (lead.centre_id) {
      return { data: { centreId: lead.centre_id }, error: "Lead already converted." };
    }

    // 2. Create centre record (schools are centres with type='school')
    const centreType = lead.type === "school" ? "school" : "childcare_centre";

    const { data: centre, error: centreError } = await supabase
      .from("centres")
      .insert({
        name: lead.centre_name,
        type: centreType,
        address: [lead.address, lead.suburb, lead.state, lead.postcode]
          .filter(Boolean)
          .join(", ") || lead.address,
        primary_contact_name: lead.contact_name,
        primary_contact_email: lead.contact_email,
        primary_contact_phone: lead.contact_phone,
        primary_contact_role: lead.contact_role,
        group_size: lead.student_count,
        agreed_rate: input.agreedRate ?? null,
        contract_status: "active",
        converted_from_lead_id: lead.id,
      })
      .select("id")
      .single();

    if (centreError || !centre) {
      return { data: null, error: centreError?.message ?? "Failed to create centre." };
    }

    // 3. Update lead: link to centre, mark as won
    await supabase
      .from("leads")
      .update({
        centre_id: centre.id,
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.leadId);

    // 4. Ensure stage is 'won'
    if (lead.stage !== "won") {
      await changeLeadStage(input.leadId, "won");
    }

    // 5. Log activity
    await supabase.from("lead_activities").insert({
      lead_id: input.leadId,
      type: "system",
      content: `Lead converted to ${centreType === "school" ? "school" : "childcare centre"}: ${lead.centre_name}`,
      metadata: { centre_id: centre.id, centre_type: centreType },
      created_by: user.id,
    });

    // 6. Create welcome task for ops
    const admin = createSupabaseAdmin();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    await admin.from("tasks").insert({
      title: `Set up first term schedule for ${lead.centre_name}`,
      priority: "high",
      linked_entity_type: "centre",
      linked_entity_id: centre.id,
      source: "crm_automation",
      due_date: dueDate.toISOString().split("T")[0],
      assignee_id: lead.owner_id ?? user.id,
    });

    // 7. Notify ops team
    await triggerNotificationForOps({
      type: "demo_outcome_recorded", // reuse existing type — new customer is noteworthy
      title: `New customer: ${lead.centre_name}`,
      body: `${lead.centre_name} has been converted from the sales pipeline. Set up their first term.`,
      entityType: "centre",
      entityId: centre.id,
    });

    // 8. Send invitation email if contact email exists
    // NOTE: Invitation system (lib/invitations/actions) will be wired up
    // when the invitation module is built. For now, the centre is created
    // and the ops team is notified to handle onboarding manually.

    revalidatePath("/admin/crm");
    revalidatePath("/admin/centres");
    revalidatePath("/ops/crm");
    revalidatePath("/ops/centres");

    return { data: { centreId: centre.id }, error: null };
  } catch (err) {
    console.error("convertLeadToCustomer error:", err);
    return { data: null, error: "Failed to convert lead." };
  }
}
