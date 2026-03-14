"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Building2,
  FileText,
  UserPlus,
  Megaphone,
  ClipboardList,
} from "lucide-react";
import type { UserRole } from "@/lib/types/enums";

interface QuickAction {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const ACTIONS_BY_ROLE: Record<string, QuickAction[]> = {
  admin: [
    {
      label: "New Centre",
      href: "/admin/centres/add",
      icon: <Building2 className="h-4 w-4" />,
    },
    {
      label: "New Invoice",
      href: "/admin/invoicing/outbound/new",
      icon: <FileText className="h-4 w-4" />,
    },
    {
      label: "New Staff",
      href: "/admin/staff/new",
      icon: <UserPlus className="h-4 w-4" />,
    },
    {
      label: "Announcement",
      href: "/admin/announcements",
      icon: <Megaphone className="h-4 w-4" />,
    },
  ],
  ops: [
    {
      label: "New Invoice",
      href: "/ops/invoicing/outbound/new",
      icon: <FileText className="h-4 w-4" />,
    },
    {
      label: "New Form",
      href: "/ops/forms/new",
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      label: "Announcement",
      href: "/ops/announcements",
      icon: <Megaphone className="h-4 w-4" />,
    },
  ],
  coach: [
    {
      label: "Submit Form",
      href: "/coach/forms",
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      label: "New Invoice",
      href: "/coach/invoicing/new",
      icon: <FileText className="h-4 w-4" />,
    },
  ],
};

interface QuickActionsProps {
  role: UserRole;
}

export function QuickActions({ role }: QuickActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const actions = ACTIONS_BY_ROLE[role];

  // Parents don't get the FAB
  if (!actions || role === "parent") return null;

  function handleAction(href: string) {
    setIsOpen(false);
    router.push(href);
  }

  // Close on outside click
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-3 md:hidden"
    >
      {/* Action items */}
      {isOpen &&
        actions.map((action, i) => (
          <button
            key={action.href}
            type="button"
            onClick={() => handleAction(action.href)}
            className="flex items-center gap-2 rounded-full bg-card border border-border px-4 py-2.5 text-sm font-medium text-foreground shadow-lg animate-in fade-in zoom-in-90 duration-200"
            style={{ animationDelay: `${i * 50}ms`, animationFillMode: "both" }}
          >
            {action.icon}
            {action.label}
          </button>
        ))}

      {/* FAB button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center transition-transform active:scale-95"
        aria-label={isOpen ? "Close quick actions" : "Open quick actions"}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Plus className="h-6 w-6" />
        )}
      </button>
    </div>
  );
}
