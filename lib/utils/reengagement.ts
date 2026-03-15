import { createSupabaseAdmin } from "@/lib/supabase/admin";

interface DormantParent {
  parentId: string;
  parentName: string;
  email: string;
  lastBookingDate: string;
  daysSinceLastBooking: number;
}

interface DecliningCentre {
  centreId: string;
  centreName: string;
  healthScore: number;
  healthStatus: string;
  contactEmail: string;
}

interface ColdLead {
  leadId: string;
  centreName: string;
  contactEmail: string;
  stage: string;
  daysSinceActivity: number;
}

interface UntrainedCoach {
  coachId: string;
  coachName: string;
  coachEmail: string;
  overdueModules: string[];
}

/**
 * Detect parents whose most recent confirmed/completed booking
 * is more than 60 days ago and who have not received a
 * re-engagement send in the last 60 days.
 */
export async function detectDormantParents(): Promise<DormantParent[]> {
  const supabase = createSupabaseAdmin();
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const cutoff = sixtyDaysAgo.toISOString();

  // Get parents with their most recent confirmed/completed booking
  const { data: parents, error: parentsError } = await supabase.rpc(
    "detect_dormant_parents",
    { cutoff_date: cutoff }
  ).select("*");

  // If no RPC exists, fall back to manual query approach
  if (parentsError) {
    // Query all parent profiles
    const { data: allParents, error: fetchError } = await supabase
      .from("parent_profiles")
      .select("id, full_name, email, user_id");

    if (fetchError || !allParents) return [];

    const dormant: DormantParent[] = [];

    for (const parent of allParents) {
      // Find their most recent confirmed/completed booking
      const { data: lastBooking } = await supabase
        .from("bookings")
        .select("date")
        .eq("parent_id", parent.id)
        .in("status", ["confirmed", "completed"])
        .order("date", { ascending: false })
        .limit(1)
        .single();

      if (!lastBooking) continue;

      const bookingDate = new Date(lastBooking.date);
      const now = new Date();
      const daysSince = Math.floor(
        (now.getTime() - bookingDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSince <= 60) continue;

      // Check if they already received a re-engagement send in the last 60 days
      const { data: recentSend } = await supabase
        .from("reengagement_sends")
        .select("id")
        .eq("recipient_id", parent.id)
        .eq("audience_type", "dormant_parent")
        .gte("created_at", cutoff)
        .limit(1)
        .single();

      if (recentSend) continue;

      dormant.push({
        parentId: parent.id,
        parentName: parent.full_name,
        email: parent.email,
        lastBookingDate: lastBooking.date,
        daysSinceLastBooking: daysSince,
      });
    }

    return dormant;
  }

  return (parents ?? []) as DormantParent[];
}

/**
 * Detect centres with declining health:
 * - health_status = 'amber' AND changed from green in last 7 days
 * - health_status = 'amber' for 30+ days
 * - health_status = 'red'
 * Excludes centres with an active re-engagement send in the last 60 days.
 */
export async function detectDecliningCentres(): Promise<DecliningCentre[]> {
  const supabase = createSupabaseAdmin();
  const now = new Date();
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get all amber or red centres
  const { data: centres, error } = await supabase
    .from("centres")
    .select("id, name, health_score, health_status, contact_email")
    .in("health_status", ["amber", "red"]);

  if (error || !centres) return [];

  const declining: DecliningCentre[] = [];

  for (const centre of centres) {
    let qualifies = false;

    if (centre.health_status === "red") {
      qualifies = true;
    } else if (centre.health_status === "amber") {
      // Check if it changed from green in last 7 days
      const { data: recentScores } = await supabase
        .from("health_scores")
        .select("health_status, created_at")
        .eq("centre_id", centre.id)
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: true });

      if (recentScores) {
        const hadGreen = recentScores.some(
          (s: { health_status: string }) => s.health_status === "green"
        );
        if (hadGreen) qualifies = true;
      }

      // Or amber for 30+ days
      if (!qualifies) {
        const { data: olderScores } = await supabase
          .from("health_scores")
          .select("health_status, created_at")
          .eq("centre_id", centre.id)
          .lte("created_at", thirtyDaysAgo.toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (olderScores && olderScores.health_status === "amber") {
          qualifies = true;
        }
      }
    }

    if (!qualifies) continue;

    // Exclude centres with active re-engagement sends in last 60 days
    const { data: activeSend } = await supabase
      .from("reengagement_sends")
      .select("id")
      .eq("recipient_id", centre.id)
      .eq("audience_type", "declining_centre")
      .in("status", ["triggered", "email_sent"])
      .gte("created_at", sixtyDaysAgo.toISOString())
      .limit(1)
      .single();

    if (activeSend) continue;

    declining.push({
      centreId: centre.id,
      centreName: centre.name,
      healthScore: centre.health_score,
      healthStatus: centre.health_status,
      contactEmail: centre.contact_email,
    });
  }

  return declining;
}

/**
 * Detect leads with no activity in 30+ days that are still
 * in an active pipeline stage (not won, lost, or churned).
 * Excludes leads with active email sequences.
 */
export async function detectColdLeads(): Promise<ColdLead[]> {
  const supabase = createSupabaseAdmin();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get active leads not in terminal stages
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, centre_name, contact_email, stage")
    .not("stage", "in", "(won,lost,churned)");

  if (error || !leads) return [];

  const cold: ColdLead[] = [];

  for (const lead of leads) {
    // Find last activity
    const { data: lastActivity } = await supabase
      .from("lead_activities")
      .select("created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!lastActivity) continue;

    const activityDate = new Date(lastActivity.created_at);
    const now = new Date();
    const daysSince = Math.floor(
      (now.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince <= 30) continue;

    // Exclude leads with active (unsent) email sequences
    const { data: activeSend } = await supabase
      .from("email_sends")
      .select("id")
      .eq("lead_id", lead.id)
      .neq("status", "sent")
      .limit(1)
      .single();

    if (activeSend) continue;

    cold.push({
      leadId: lead.id,
      centreName: lead.centre_name,
      contactEmail: lead.contact_email,
      stage: lead.stage,
      daysSinceActivity: daysSince,
    });
  }

  return cold;
}

/**
 * Detect coaches with overdue or stalled mandatory training assignments.
 * - Status = 'overdue'
 * - OR status != 'completed' and assigned 14+ days ago for mandatory modules
 */
export async function detectUntrainedCoaches(): Promise<UntrainedCoach[]> {
  const supabase = createSupabaseAdmin();
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // Get overdue assignments
  const { data: overdueAssignments, error: overdueError } = await supabase
    .from("training_assignments")
    .select(`
      id,
      coach_id,
      module_id,
      pathway_id,
      status,
      created_at,
      training_modules!inner (
        id,
        title,
        mandatory
      ),
      profiles!training_assignments_coach_id_fkey (
        id,
        full_name,
        email
      )
    `)
    .or(
      `status.eq.overdue,and(status.neq.completed,created_at.lte.${fourteenDaysAgo.toISOString()})`
    );

  if (overdueError || !overdueAssignments) return [];

  // Filter to mandatory modules only and group by coach
  const coachMap = new Map<
    string,
    { coachName: string; coachEmail: string; overdueModules: string[] }
  >();

  for (const assignment of overdueAssignments) {
    const module = assignment.training_modules as unknown as {
      id: string;
      title: string;
      mandatory: boolean;
    };
    const profile = assignment.profiles as unknown as {
      id: string;
      full_name: string;
      email: string;
    };

    if (!module?.mandatory) continue;
    if (!profile) continue;

    const existing = coachMap.get(assignment.coach_id);
    if (existing) {
      if (!existing.overdueModules.includes(module.title)) {
        existing.overdueModules.push(module.title);
      }
    } else {
      coachMap.set(assignment.coach_id, {
        coachName: profile.full_name,
        coachEmail: profile.email,
        overdueModules: [module.title],
      });
    }
  }

  return Array.from(coachMap.entries()).map(([coachId, data]) => ({
    coachId,
    coachName: data.coachName,
    coachEmail: data.coachEmail,
    overdueModules: data.overdueModules,
  }));
}

/**
 * Run all re-engagement detection and create send records.
 * Called by the cron job.
 */
export async function processReengagement(): Promise<{
  dormantParents: number;
  decliningCentres: number;
  coldLeads: number;
  untrainedCoaches: number;
}> {
  const supabase = createSupabaseAdmin();

  const [dormantParents, decliningCentres, coldLeads, untrainedCoaches] =
    await Promise.all([
      detectDormantParents(),
      detectDecliningCentres(),
      detectColdLeads(),
      detectUntrainedCoaches(),
    ]);

  // Create reengagement_sends for dormant parents
  if (dormantParents.length > 0) {
    const sends = dormantParents.map((p) => ({
      recipient_id: p.parentId,
      audience_type: "dormant_parent",
      status: "triggered",
      metadata: {
        parent_name: p.parentName,
        email: p.email,
        last_booking_date: p.lastBookingDate,
        days_since_last_booking: p.daysSinceLastBooking,
      },
    }));

    await supabase.from("reengagement_sends").insert(sends);

    // Logged for cron job observability
    console.info(
      `[Re-engagement] Created ${dormantParents.length} dormant parent sends`
    );
  }

  // Create reengagement_sends for declining centres + ops tasks
  if (decliningCentres.length > 0) {
    const sends = decliningCentres.map((c) => ({
      recipient_id: c.centreId,
      audience_type: "declining_centre",
      status: "triggered",
      metadata: {
        centre_name: c.centreName,
        health_score: c.healthScore,
        health_status: c.healthStatus,
        contact_email: c.contactEmail,
      },
    }));

    await supabase.from("reengagement_sends").insert(sends);

    // Create ops tasks for declining centres
    const tasks = decliningCentres.map((c) => ({
      title: `Re-engage declining centre: ${c.centreName}`,
      description: `${c.centreName} has a health score of ${c.healthScore} (${c.healthStatus}). Review and take action to re-engage.`,
      status: "todo",
      priority: c.healthStatus === "red" ? "high" : "medium",
      entity_type: "centre",
      entity_id: c.centreId,
    }));

    await supabase.from("tasks").insert(tasks);

    console.info(
      `[Re-engagement] Created ${decliningCentres.length} declining centre sends and tasks`
    );
  }

  // Create reengagement_sends for cold leads
  if (coldLeads.length > 0) {
    const sends = coldLeads.map((l) => ({
      recipient_id: l.leadId,
      audience_type: "cold_lead",
      status: "triggered",
      metadata: {
        centre_name: l.centreName,
        contact_email: l.contactEmail,
        stage: l.stage,
        days_since_activity: l.daysSinceActivity,
      },
    }));

    await supabase.from("reengagement_sends").insert(sends);

    console.info(
      `[Re-engagement] Created ${coldLeads.length} cold lead sends`
    );
  }

  // Create reengagement_sends for untrained coaches
  if (untrainedCoaches.length > 0) {
    const sends = untrainedCoaches.map((c) => ({
      recipient_id: c.coachId,
      audience_type: "untrained_coach",
      status: "triggered",
      metadata: {
        coach_name: c.coachName,
        coach_email: c.coachEmail,
        overdue_modules: c.overdueModules,
      },
    }));

    await supabase.from("reengagement_sends").insert(sends);

    console.info(
      `[Re-engagement] Created ${untrainedCoaches.length} untrained coach sends`
    );
  }

  return {
    dormantParents: dormantParents.length,
    decliningCentres: decliningCentres.length,
    coldLeads: coldLeads.length,
    untrainedCoaches: untrainedCoaches.length,
  };
}
