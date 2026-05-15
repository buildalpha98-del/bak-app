"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, Target, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ProgramContentJson, WarmUpSection, SkillDrill, ModifiedGameSection, CoolDownSection } from "@/lib/ai/types";

// ============================================================
// ProgramView — reusable renderer for programme content_json
// ============================================================

interface ProgramViewProps {
  /** The content_json from the programs table */
  content: ProgramContentJson | Record<string, unknown>;
  /** Wrap sections in collapsible panels (mobile-friendly) */
  collapsible?: boolean;
  className?: string;
}

/**
 * Normalise content_json to ProgramContentJson shape.
 * Handles both camelCase (AI output) and snake_case (legacy).
 */
function normalise(raw: Record<string, unknown>): Partial<ProgramContentJson> {
  return {
    title: (raw.title as string) ?? undefined,
    sport: (raw.sport as string) ?? undefined,
    ageGroup: (raw.ageGroup ?? raw.age_group) as string | undefined,
    duration: (raw.duration ?? raw.duration_minutes) as number | undefined,
    objectives: (raw.objectives as string[]) ?? undefined,
    equipmentNeeded: (raw.equipmentNeeded ?? raw.equipment_needed) as string[] | undefined,
    warmUp: (raw.warmUp ?? raw.warm_up) as WarmUpSection | undefined,
    skillDevelopment: (raw.skillDevelopment ?? raw.skill_development ?? raw.drills) as SkillDrill[] | undefined,
    modifiedGame: (raw.modifiedGame ?? raw.modified_game ?? raw.game) as ModifiedGameSection | undefined,
    coolDown: (raw.coolDown ?? raw.cool_down) as CoolDownSection | undefined,
  };
}

function DurationBadge({ minutes }: { minutes: number }) {
  return (
    <Badge variant="secondary" className="text-[10px] font-normal">
      <Clock className="mr-1 h-3 w-3" />
      {minutes} min
    </Badge>
  );
}

function SectionHeader({
  title,
  duration,
  collapsible,
  isOpen,
  onToggle,
}: {
  title: string;
  duration?: number;
  collapsible?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <div className="flex items-center gap-2">
      {collapsible && (
        isOpen ? (
          <ChevronDown className="h-4 w-4 text-primary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-primary" />
        )
      )}
      <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
        {title}
      </h4>
      {duration != null && <DurationBadge minutes={duration} />}
    </div>
  );

  if (collapsible && onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center py-1 text-left"
      >
        {content}
      </button>
    );
  }

  return <div className="py-1">{content}</div>;
}

function CoachingTip({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="mt-2 rounded-lg bg-[var(--brand-orange-light)] px-3 py-2">
      <p className="text-xs font-medium text-primary">Coaching tip</p>
      <p className="text-xs text-foreground">{text}</p>
    </div>
  );
}

function BulletList({ items, className }: { items: string[]; className?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className={`space-y-1 pl-4 ${className ?? ""}`}>
      {items.map((item, i) => (
        <li
          key={i}
          className="text-sm text-foreground list-disc marker:text-primary"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

// ============================================================
// Section renderers
// ============================================================

function WarmUpContent({ section }: { section: WarmUpSection }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{section.name}</p>
      <p className="text-sm text-foreground whitespace-pre-wrap">{section.description}</p>
      <CoachingTip text={section.coachingTips} />
    </div>
  );
}

function SkillDevelopmentContent({ drills }: { drills: SkillDrill[] }) {
  return (
    <div className="space-y-4">
      {drills.map((drill, i) => (
        <div key={i} className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{drill.name}</p>
            <DurationBadge minutes={drill.duration} />
          </div>
          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">
            {drill.description}
          </p>
          {drill.progressions && drill.progressions.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-muted-foreground">Progressions</p>
              <BulletList items={drill.progressions} />
            </div>
          )}
          {drill.scaffolds && Object.keys(drill.scaffolds).length > 0 && (
            <div className="mt-2 space-y-1 rounded bg-secondary/40 px-3 py-2 text-xs">
              <p className="font-medium text-muted-foreground">By age:</p>
              {Object.entries(drill.scaffolds).map(([band, note]) => (
                <p key={band} className="text-foreground">
                  <span className="font-medium">{band}:</span> {note}
                </p>
              ))}
            </div>
          )}
          <CoachingTip text={drill.coachingTips} />
        </div>
      ))}
    </div>
  );
}

function ModifiedGameContent({ section }: { section: ModifiedGameSection }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{section.name}</p>
      <p className="text-sm text-foreground whitespace-pre-wrap">{section.description}</p>
      {section.rules && section.rules.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Rules</p>
          <BulletList items={section.rules} />
        </div>
      )}
      {section.variations && section.variations.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Variations</p>
          <BulletList items={section.variations} />
        </div>
      )}
      <CoachingTip text={section.coachingTips} />
    </div>
  );
}

function CoolDownContent({ section }: { section: CoolDownSection }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{section.name}</p>
      <p className="text-sm text-foreground whitespace-pre-wrap">{section.description}</p>
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

export function ProgramView({
  content,
  collapsible = false,
  className,
}: ProgramViewProps) {
  const data = normalise(content as Record<string, unknown>);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    warmUp: true,
    skillDevelopment: true,
    modifiedGame: true,
    coolDown: true,
  });

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">No programme details available.</p>
      </div>
    );
  }

  const sections: {
    key: string;
    title: string;
    duration?: number;
    render: () => React.ReactNode;
  }[] = [];

  if (data.warmUp) {
    sections.push({
      key: "warmUp",
      title: "Warm Up",
      duration: data.warmUp.duration,
      render: () => <WarmUpContent section={data.warmUp!} />,
    });
  }

  if (data.skillDevelopment && data.skillDevelopment.length > 0) {
    const totalDrill = data.skillDevelopment.reduce(
      (sum, d) => sum + (d.duration ?? 0),
      0
    );
    sections.push({
      key: "skillDevelopment",
      title: "Skill Development",
      duration: totalDrill || undefined,
      render: () => <SkillDevelopmentContent drills={data.skillDevelopment!} />,
    });
  }

  if (data.modifiedGame) {
    sections.push({
      key: "modifiedGame",
      title: "Modified Game",
      duration: data.modifiedGame.duration,
      render: () => <ModifiedGameContent section={data.modifiedGame!} />,
    });
  }

  if (data.coolDown) {
    sections.push({
      key: "coolDown",
      title: "Cool Down",
      duration: data.coolDown.duration,
      render: () => <CoolDownContent section={data.coolDown!} />,
    });
  }

  return (
    <div className={`space-y-6 ${className ?? ""}`}>
      {/* Header */}
      {data.title && (
        <div>
          <h3 className="text-lg font-semibold text-foreground">{data.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {data.sport && (
              <Badge variant="outline" className="text-xs">
                {data.sport}
              </Badge>
            )}
            {data.ageGroup && (
              <Badge variant="outline" className="text-xs">
                Ages {data.ageGroup}
              </Badge>
            )}
            {data.duration && <DurationBadge minutes={data.duration} />}
          </div>
        </div>
      )}

      {/* Objectives */}
      {data.objectives && data.objectives.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="h-3.5 w-3.5 text-primary" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
              Objectives
            </h4>
          </div>
          <BulletList items={data.objectives} />
        </div>
      )}

      {/* Equipment needed */}
      {data.equipmentNeeded && data.equipmentNeeded.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Package className="h-3.5 w-3.5 text-primary" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
              Equipment Needed
            </h4>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.equipmentNeeded.map((item) => (
              <Badge key={item} variant="secondary" className="text-xs">
                {item}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.map((section) => {
        const isOpen = openSections[section.key] ?? true;

        if (collapsible) {
          return (
            <Collapsible key={section.key} open={isOpen}>
              <CollapsibleTrigger
                className="w-full text-left"
                onClick={() => toggleSection(section.key)}
              >
                <SectionHeader
                  title={section.title}
                  duration={section.duration}
                  collapsible
                  isOpen={isOpen}
                  onToggle={() => toggleSection(section.key)}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pt-2">{section.render()}</div>
              </CollapsibleContent>
            </Collapsible>
          );
        }

        return (
          <div key={section.key}>
            <SectionHeader title={section.title} duration={section.duration} />
            <div className="pt-2">{section.render()}</div>
          </div>
        );
      })}
    </div>
  );
}
