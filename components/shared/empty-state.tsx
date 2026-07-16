import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  Users,
  FileText,
  Receipt,
  MessageSquare,
  ClipboardList,
  Package,
  Bell,
  Search,
  Inbox,
} from "lucide-react";
import Link from "@/components/ui/app-link";

export const EMPTY_STATES = {
  sessions: {
    icon: Calendar,
    title: "No sessions yet",
    description: "Sessions will appear here once the roster is published.",
  },
  staff: {
    icon: Users,
    title: "No staff members",
    description: "Add your first coach to get started.",
  },
  invoices: {
    icon: Receipt,
    title: "No invoices",
    description: "Invoices will appear here once generated.",
  },
  messages: {
    icon: MessageSquare,
    title: "No messages yet",
    description: "Start a conversation to see messages here.",
  },
  forms: {
    icon: ClipboardList,
    title: "No forms submitted",
    description: "Form submissions will appear here.",
  },
  documents: {
    icon: FileText,
    title: "No documents",
    description: "Upload documents to share with your team.",
  },
  equipment: {
    icon: Package,
    title: "No equipment logged",
    description: "Equipment logs will appear here.",
  },
  notifications: {
    icon: Bell,
    title: "All caught up!",
    description: "No new notifications.",
  },
  search: {
    icon: Search,
    title: "No results found",
    description: "Try adjusting your search or filters.",
  },
  default: {
    icon: Inbox,
    title: "Nothing here yet",
    description: "Content will appear here soon.",
  },
} as const;

interface EmptyStateProps {
  preset?: keyof typeof EMPTY_STATES;
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  compact?: boolean;
}

export function EmptyState({
  preset = "default",
  icon,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  const presetConfig = EMPTY_STATES[preset];
  const Icon = icon ?? presetConfig.icon;
  const resolvedTitle = title ?? presetConfig.title;
  const resolvedDescription = description ?? presetConfig.description;

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-8" : "py-16"
      }`}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/60">
        <Icon className={`${compact ? "h-7 w-7" : "h-8 w-8"} text-muted-foreground`} />
      </div>
      <h3
        className={`mt-4 font-semibold text-foreground ${
          compact ? "text-sm" : "text-base"
        }`}
      >
        {resolvedTitle}
      </h3>
      <p
        className={`mt-1 max-w-xs text-muted-foreground ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        {resolvedDescription}
      </p>
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
