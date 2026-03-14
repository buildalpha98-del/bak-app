import { notFound } from "next/navigation";
import { getCentreForCoach } from "@/lib/centres/actions";
import { CoachCentreView } from "@/components/centres/coach-centre-view";

interface CoachCentreDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CoachCentreDetailPage({
  params,
}: CoachCentreDetailPageProps) {
  const { id } = await params;
  const { data, error } = await getCentreForCoach(id);

  if (error || !data) {
    notFound();
  }

  return <CoachCentreView data={data} />;
}
