import { notFound } from "next/navigation";
import { getStaffMember } from "@/lib/staff/actions";
import { StaffDetailView } from "@/components/staff/staff-detail-view";

interface StaffDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OpsStaffDetailPage({ params }: StaffDetailPageProps) {
  const { id } = await params;
  const { data, error } = await getStaffMember(id);

  if (error || !data) {
    notFound();
  }

  return <StaffDetailView data={data} />;
}
