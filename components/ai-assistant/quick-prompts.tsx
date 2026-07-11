"use client";

import { Button } from "@/components/ui/button";
import {
  Cloud,
  Dumbbell,
  Sun,
  Snowflake,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface QuickPromptsProps {
  onSelect: (prompt: string) => void;
}

interface QuickPrompt {
  label: string;
  prompt: string;
  icon: LucideIcon;
}

const QUICK_PROMPTS: QuickPrompt[] = [
  {
    label: "Rainy day alternatives",
    prompt:
      "It's raining today. What are some good indoor alternatives or modifications I can make to run this session indoors?",
    icon: Cloud,
  },
  {
    label: "Low equipment ideas",
    prompt:
      "I have limited equipment available. What activities can I run with minimal or no equipment for this session?",
    icon: Dumbbell,
  },
  {
    label: "Warm-up games",
    prompt:
      "Suggest some fun and engaging warm-up games that are appropriate for the age group and sport of this session.",
    icon: Sun,
  },
  {
    label: "Cool-down activities",
    prompt:
      "What are some good cool-down activities and stretches to end this session on a positive note?",
    icon: Snowflake,
  },
  {
    label: "Behaviour management tips",
    prompt:
      "Give me some practical behaviour management strategies for keeping children focused and engaged during the session.",
    icon: Users,
  },
  {
    label: "Age-appropriate modifications",
    prompt:
      "How can I modify the activities in this session to cater to different skill levels and abilities within the group?",
    icon: Zap,
  },
];

export function QuickPrompts({ onSelect }: QuickPromptsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {QUICK_PROMPTS.map((prompt) => {
        const Icon = prompt.icon;
        return (
          <Button
            key={prompt.label}
            variant="outline"
            size="sm"
            className="h-auto flex-col items-start gap-1 px-3 py-2.5 text-left text-xs whitespace-normal hover:bg-primary/10 hover:border-primary/30"
            onClick={() => onSelect(prompt.prompt)}
          >
            <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="leading-tight">{prompt.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
