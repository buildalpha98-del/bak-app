// ============================================================
// AI Coach Assistant — Context Assembly (pure utility)
// ============================================================

export interface SessionContextData {
  session: {
    id: string;
    sport: string;
    date: string;
    time: string;
    duration_minutes: number;
    status: string;
  };
  centre: {
    name: string;
    type: string;
    age_groups: string[];
    group_size: number | null;
  };
  program: {
    title?: string;
    skill_focus?: string;
    equipment_used?: string[];
    content_summary?: string;
  } | null;
  children: {
    total: number;
    age_groups: string[];
  };
  weather?: {
    condition: string;
    temperature: number;
  } | null;
}

/**
 * Assemble a context string for the Claude system prompt.
 * Takes session details, centre info, program plan, child list, and optional weather.
 */
export function assembleSessionContext(
  sessionData: SessionContextData
): string {
  const { session, centre, program, children, weather } = sessionData;

  const lines: string[] = [
    "## Current Session Context",
    "",
    `**Sport:** ${session.sport}`,
    `**Centre:** ${centre.name} (${centre.type})`,
    `**Date:** ${session.date}`,
    `**Time:** ${session.time}`,
    `**Duration:** ${session.duration_minutes} minutes`,
    `**Session Status:** ${session.status}`,
  ];

  // Children info
  lines.push("");
  lines.push(`**Number of Children:** ${children.total}`);
  if (children.age_groups.length > 0) {
    lines.push(`**Age Groups:** ${children.age_groups.join(", ")}`);
  }

  // Group size
  if (centre.group_size) {
    lines.push(`**Expected Group Size:** ${centre.group_size}`);
  }

  // Programme info
  if (program) {
    lines.push("");
    lines.push("## Programme Outline");
    if (program.title) {
      lines.push(`**Title:** ${program.title}`);
    }
    if (program.skill_focus) {
      lines.push(`**Skill Focus:** ${program.skill_focus}`);
    }
    if (program.equipment_used && program.equipment_used.length > 0) {
      lines.push(`**Equipment Available:** ${program.equipment_used.join(", ")}`);
    }
    if (program.content_summary) {
      lines.push(`**Plan Summary:** ${program.content_summary}`);
    }
  }

  // Weather
  if (weather) {
    lines.push("");
    lines.push("## Weather Conditions");
    lines.push(`**Condition:** ${weather.condition}`);
    lines.push(`**Temperature:** ${weather.temperature}°C`);
  }

  return lines.join("\n");
}
