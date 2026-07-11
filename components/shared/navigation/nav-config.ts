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
  Award,
  Inbox,
  Wallet,
  Mail,
  ThumbsUp,
} from "lucide-react";
import type { UserRole } from "@/lib/types/enums";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  mobileOrder?: number;
  /**
   * When true, this item is hidden from the sidebar / bottom tabs /
   * command palette for users with `financial_access = false`. The
   * server-side guard at `lib/auth/financial-access.ts` is the source
   * of truth — this flag is the UI mirror.
   */
  financial?: boolean;
  /**
   * Sidebar group heading. Consecutive items sharing a section render
   * under one label; items without one (Dashboard, Inbox) sit at the
   * top ungrouped. Admin/ops only — coach and parent lists are short
   * enough to stay flat.
   */
  section?: string;
}

/**
 * Filter a role's nav list against the current user's financial-access
 * flag. UI helper only — server enforcement lives in
 * `requireFinancialAccess()`.
 */
export function filterNavByAccess(
  items: NavItem[],
  financialAccess: boolean
): NavItem[] {
  if (financialAccess) return items;
  return items.filter((item) => !item.financial);
}

export const NAV_CONFIG: Record<UserRole, NavItem[]> = {
  admin: [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard, mobileOrder: 1 },
    { label: "Inbox", href: "/admin/inbox", icon: Inbox },
    { label: "Centres & Schools", href: "/admin/centres", icon: Building2, mobileOrder: 2, section: "Operate" },
    { label: "Roster", href: "/admin/roster", icon: Calendar, mobileOrder: 3, section: "Operate" },
    { label: "Programs", href: "/admin/programs", icon: BookOpen, section: "Operate" },
    { label: "Assessments", href: "/admin/assessments", icon: Star, section: "Operate" },
    { label: "Equipment", href: "/admin/equipment", icon: Package, section: "Operate" },
    { label: "Forms", href: "/admin/forms", icon: ClipboardList, mobileOrder: 4, section: "Operate" },
    { label: "Documents", href: "/admin/documents", icon: FileText, section: "Operate" },
    { label: "Staff", href: "/admin/staff", icon: Users, section: "People" },
    { label: "Children", href: "/admin/children", icon: Baby, section: "People" },
    { label: "Performance", href: "/admin/performance", icon: TrendingUp, section: "People" },
    { label: "Training", href: "/admin/training", icon: GraduationCap, section: "People" },
    { label: "Invoicing", href: "/admin/invoicing", icon: Receipt, financial: true, section: "Money" },
    { label: "Payroll", href: "/admin/payroll", icon: Wallet, financial: true, section: "Money" },
    { label: "Grants", href: "/admin/grants", icon: Award, financial: true, section: "Money" },
    { label: "Analytics", href: "/admin/analytics", icon: LineChart, financial: true, section: "Money" },
    { label: "CRM", href: "/admin/crm", icon: Target, section: "Growth" },
    { label: "Bookings", href: "/admin/bookings", icon: ShoppingBag, section: "Growth" },
    { label: "Marketing", href: "/admin/marketing", icon: Globe, section: "Growth" },
    { label: "Referrals", href: "/admin/referrals", icon: Gift, section: "Growth" },
    { label: "Campaigns", href: "/admin/campaigns", icon: BarChart3, section: "Growth" },
    { label: "Intelligence", href: "/admin/intelligence", icon: Brain, financial: true, section: "Growth" },
    { label: "Churn Risk", href: "/admin/churn", icon: AlertTriangle, section: "Growth" },
    { label: "Reports", href: "/admin/reports", icon: FileBarChart, section: "Growth" },
    { label: "Tasks", href: "/admin/tasks", icon: CheckSquare, section: "Admin" },
    { label: "Feedback", href: "/admin/feedback", icon: ThumbsUp, section: "Admin" },
    { label: "Announcements", href: "/admin/announcements", icon: Megaphone, section: "Admin" },
    { label: "Messages", href: "/admin/messages", icon: MessageSquare, section: "Admin" },
    { label: "Centre Inbox", href: "/admin/centre-messages", icon: Mail, section: "Admin" },
    { label: "Settings", href: "/admin/settings", icon: Settings, mobileOrder: 5, section: "Admin" },
  ],
  ops: [
    { label: "Command Centre", href: "/ops", icon: LayoutDashboard, mobileOrder: 1 },
    { label: "Inbox", href: "/ops/inbox", icon: Inbox },
    { label: "Centres & Schools", href: "/ops/centres", icon: Building2, mobileOrder: 2, section: "Operate" },
    { label: "Roster", href: "/ops/roster", icon: Calendar, mobileOrder: 3, section: "Operate" },
    { label: "Onboarding", href: "/ops/onboarding", icon: Compass, section: "Operate" },
    { label: "Programs", href: "/ops/programs", icon: BookOpen, section: "Operate" },
    { label: "Assessments", href: "/ops/assessments", icon: Star, section: "Operate" },
    { label: "Equipment", href: "/ops/equipment", icon: Package, section: "Operate" },
    { label: "Forms", href: "/ops/forms", icon: ClipboardList, mobileOrder: 4, section: "Operate" },
    { label: "Documents", href: "/ops/documents", icon: FileText, section: "Operate" },
    { label: "Staff", href: "/ops/staff", icon: Users, section: "People" },
    { label: "Children", href: "/ops/children", icon: Baby, section: "People" },
    { label: "Performance", href: "/ops/performance", icon: TrendingUp, section: "People" },
    { label: "Training", href: "/ops/training", icon: GraduationCap, section: "People" },
    { label: "Invoicing", href: "/ops/invoicing", icon: Receipt, financial: true, section: "Money" },
    { label: "CRM", href: "/ops/crm", icon: Target, section: "Growth" },
    { label: "Bookings", href: "/ops/bookings/sessions", icon: ShoppingBag, section: "Growth" },
    { label: "Reports", href: "/ops/reports", icon: FileBarChart, section: "Growth" },
    { label: "Tasks", href: "/ops/tasks", icon: CheckSquare, mobileOrder: 5, section: "Admin" },
    { label: "Feedback", href: "/ops/feedback", icon: ThumbsUp, section: "Admin" },
    { label: "Announcements", href: "/ops/announcements", icon: Megaphone, section: "Admin" },
    { label: "Messages", href: "/ops/messages", icon: MessageSquare, section: "Admin" },
    { label: "Centre Inbox", href: "/ops/centre-messages", icon: Mail, section: "Admin" },
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
    { label: "Tasks", href: "/coach/tasks", icon: CheckSquare },
    { label: "Assessments", href: "/coach/assessments", icon: Star },
    { label: "Announcements", href: "/coach/announcements", icon: Megaphone },
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

export function getMobileItems(
  role: UserRole,
  financialAccess: boolean = true
): NavItem[] {
  return filterNavByAccess(NAV_CONFIG[role], financialAccess)
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
