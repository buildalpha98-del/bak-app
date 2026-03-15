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
  TrendingUp,
  GraduationCap,
  Ticket,
  ShoppingBag,
  Globe,
  Gift,
  BarChart3,
  Brain,
  MapPin,
  AlertTriangle,
  Target,
  LineChart,
  Baby,
  Star,
  FileBarChart,
  Compass,
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
    { label: "CRM", href: "/admin/crm", icon: Target },
    { label: "Staff", href: "/admin/staff", icon: Users },
    { label: "Children", href: "/admin/children", icon: Baby },
    { label: "Performance", href: "/admin/performance", icon: TrendingUp },
    { label: "Assessments", href: "/admin/assessments", icon: Star },
    { label: "Programs", href: "/admin/programs", icon: BookOpen },
    { label: "Training", href: "/admin/training", icon: GraduationCap },
    { label: "Equipment", href: "/admin/equipment", icon: Package },
    { label: "Documents", href: "/admin/documents", icon: FileText },
    { label: "Forms", href: "/admin/forms", icon: ClipboardList, mobileOrder: 4 },
    { label: "Invoicing", href: "/admin/invoicing", icon: Receipt },
    { label: "Reports", href: "/admin/reports", icon: FileBarChart },
    { label: "Analytics", href: "/admin/analytics", icon: LineChart },
    { label: "Tasks", href: "/admin/tasks", icon: CheckSquare },
    { label: "Feedback", href: "/admin/feedback", icon: MessageSquare },
    { label: "Bookings", href: "/admin/bookings", icon: ShoppingBag },
    { label: "Marketing", href: "/admin/marketing", icon: Globe },
    { label: "Referrals", href: "/admin/referrals", icon: Gift },
    { label: "Campaigns", href: "/admin/campaigns", icon: BarChart3 },
    { label: "Intelligence", href: "/admin/intelligence", icon: Brain },
    { label: "Churn Risk", href: "/admin/churn", icon: AlertTriangle },
    { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
    { label: "Messages", href: "/admin/messages", icon: MessageSquare },
    { label: "Settings", href: "/admin/settings", icon: Settings, mobileOrder: 5 },
  ],
  ops: [
    { label: "Command Centre", href: "/ops", icon: LayoutDashboard, mobileOrder: 1 },
    { label: "Centres & Schools", href: "/ops/centres", icon: Building2, mobileOrder: 2 },
    { label: "Roster", href: "/ops/roster", icon: Calendar, mobileOrder: 3 },
    { label: "CRM", href: "/ops/crm", icon: Target },
    { label: "Staff", href: "/ops/staff", icon: Users },
    { label: "Children", href: "/ops/children", icon: Baby },
    { label: "Performance", href: "/ops/performance", icon: TrendingUp },
    { label: "Assessments", href: "/ops/assessments", icon: Star },
    { label: "Programs", href: "/ops/programs", icon: BookOpen },
    { label: "Training", href: "/ops/training", icon: GraduationCap },
    { label: "Onboarding", href: "/ops/onboarding", icon: Compass },
    { label: "Equipment", href: "/ops/equipment", icon: Package },
    { label: "Documents", href: "/ops/documents", icon: FileText },
    { label: "Forms", href: "/ops/forms", icon: ClipboardList, mobileOrder: 4 },
    { label: "Invoicing", href: "/ops/invoicing", icon: Receipt },
    { label: "Reports", href: "/ops/reports", icon: FileBarChart },
    { label: "Tasks", href: "/ops/tasks", icon: CheckSquare, mobileOrder: 5 },
    { label: "Feedback", href: "/ops/feedback", icon: MessageSquare },
    { label: "Announcements", href: "/ops/announcements", icon: Megaphone },
    { label: "Messages", href: "/ops/messages", icon: MessageSquare },
  ],
  coach: [
    { label: "Home", href: "/coach", icon: Home, mobileOrder: 1 },
    { label: "Schedule", href: "/coach/schedule", icon: Calendar, mobileOrder: 2 },
    { label: "Forms", href: "/coach/forms", icon: ClipboardList, mobileOrder: 3 },
    { label: "Messages", href: "/coach/messages", icon: MessageSquare, mobileOrder: 4 },
    { label: "Training", href: "/coach/training", icon: GraduationCap },
    { label: "Invoicing", href: "/coach/invoicing", icon: Receipt },
    { label: "Docs", href: "/coach/docs", icon: FileText },
    { label: "Performance", href: "/coach/performance", icon: TrendingUp },
    { label: "Profile", href: "/coach/profile", icon: User, mobileOrder: 5 },
  ],
  parent: [
    { label: "Home", href: "/parent", icon: Home, mobileOrder: 1 },
    { label: "Book", href: "/parent/book", icon: Calendar, mobileOrder: 2 },
    { label: "My Kids", href: "/parent/kids", icon: Users, mobileOrder: 3 },
    { label: "Bookings", href: "/parent/bookings", icon: Ticket, mobileOrder: 4 },
    { label: "Packages", href: "/parent/packages", icon: Package },
    { label: "Refer", href: "/parent/referrals", icon: Gift },
    { label: "Account", href: "/parent/account", icon: User, mobileOrder: 5 },
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
  parent: "Parent Portal",
};

const ROLE_ROOTS = ["/admin", "/ops", "/coach", "/parent"];

export function isNavItemActive(href: string, pathname: string): boolean {
  if (ROLE_ROOTS.includes(href)) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}
