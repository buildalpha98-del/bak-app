import { notFound } from "next/navigation";
import { getStaffMember } from "@/lib/staff/actions";
import { StaffDetailView } from "@/components/staff/staff-detail-view";

interface StaffDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function StaffDetailPage({ params }: StaffDetailPageProps) {
  const { id } = await params;
  const { data, error } = await getStaffMember(id);

  if (error || !data) {
    notFound();
  }

  // Only admins land on /admin/staff/[id] (the DashboardShell would
  // redirect ops to /ops). The financial-access toggle is admin-only.
  return <StaffDetailView data={data} canEditFinancialAccess />;
}
