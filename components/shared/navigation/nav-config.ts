import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Calendar,
  Users,
  BookOpen,
  Package,
  FileText,
  ClipboardList,
  Receipt,
  CheckSquare,
  Megaphone,
  Settings,
  Home,
  User,
  MessageSquare,
} from "lucide-react";
import type { UserRole } from "@/lib/types/enums";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  mobileOrder?: number;
}

export const NAV_CONFIG: Record<UserRole, NavItem[]> = {
  admin: [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard, mobileOrder: 1 },
    { label: "Centres & Schools", href: "/admin/centres", icon: Building2, mobileOrder: 2 },
    { label: "Roster", href: "/admin/roster", icon: Calendar, mobileOrder: 3 },
    { label: "Staff", href: "/admin/staff", icon: Users },
    { label: "Programs", href: "/admin/programs", icon: BookOpen },
    { label: "Equipment", href: "/admin/equipment", icon: Package },
    { label: "Documents", href: "/admin/documents", icon: FileText },
    { label: "Forms", href: "/admin/forms", icon: ClipboardList, mobileOrder: 4 },
    { label: "Invoicing", href: "/admin/invoicing", icon: Receipt },
    { label: "Tasks", href: "/admin/tasks", icon: CheckSquare },
    { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
    { label: "Messages", href: "/admin/messages", icon: MessageSquare },
    { label: "Settings", href: "/admin/settings", icon: Settings, mobileOrder: 5 },
  ],
  ops: [
    { label: "Command Centre", href: "/ops", icon: LayoutDashboard, mobileOrder: 1 },
    { label: "Centres & Schools", href: "/ops/centres", icon: Building2, mobileOrder: 2 },
    { label: "Roster", href: "/ops/roster", icon: Calendar, mobileOrder: 3 },
    { label: "Staff", href: "/ops/staff", icon: Users },
    { label: "Programs", href: "/ops/programs", icon: BookOpen },
    { label: "Equipment", href: "/ops/equipment", icon: Package },
    { label: "Documents", href: "/ops/documents", icon: FileText },
    { label: "Forms", href: "/ops/forms", icon: ClipboardList, mobileOrder: 4 },
    { label: "Invoicing", href: "/ops/invoicing", icon: Receipt },
    { label: "Tasks", href: "/ops/tasks", icon: CheckSquare, mobileOrder: 5 },
    { label: "Announcements", href: "/ops/announcements", icon: Megaphone },
    { label: "Messages", href: "/ops/messages", icon: MessageSquare },
  ],
  coach: [
    { label: "Home", href: "/coach", icon: Home, mobileOrder: 1 },
    { label: "Schedule", href: "/coach/schedule", icon: Calendar, mobileOrder: 2 },
    { label: "Forms", href: "/coach/forms", icon: ClipboardList, mobileOrder: 3 },
    { label: "Messages", href: "/coach/messages", icon: MessageSquare, mobileOrder: 4 },
    { label: "Invoicing", href: "/coach/invoicing", icon: Receipt },
    { label: "Docs", href: "/coach/docs", icon: FileText },
    { label: "Profile", href: "/coach/profile", icon: User, mobileOrder: 5 },
  ],
};

export function getMobileItems(role: UserRole): NavItem[] {
  return NAV_CONFIG[role]
    .filter((item) => item.mobileOrder !== undefined)
    .sort((a, b) => a.mobileOrder! - b.mobileOrder!);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  ops: "Operations",
  coach: "Coach",
};

const ROLE_ROOTS = ["/admin", "/ops", "/coach"];

export function isNavItemActive(href: string, pathname: string): boolean {
  if (ROLE_ROOTS.includes(href)) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}
