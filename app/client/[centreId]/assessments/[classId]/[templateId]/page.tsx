import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClassAssessmentGrid } from "@/lib/client/assessment-actions";
import { ClassAssessmentGrid } from "@/components/client/class-assessment-grid";
import Link from "@/components/ui/app-link";

// One class × one sport as a grid (migration 088). Desktop-first: a
// teacher fills the whole class here; the one-by-one flow is for phones.

export default async function ClassAssessmentGridPage({
  params,
}: {
  params: Promise<{ centreId: string; classId: string; templateId: string }>;
}) {
  const { centreId, classId, templateId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.is_authorised_for_current === false)
    redirect(`/client/${clientUser.centre_id}`);
  if (clientUser.centre_type !== "school") redirect(`/client/${centreId}`);

  const { data: grid, error } = await getClassAssessmentGrid(centreId, classId, templateId);
  if (error || !grid) {
    return (
      <div className="animate-fade-up space-y-4">
        <p className="text-sm text-destructive">{error ?? "Not found."}</p>
        <Link href={`/client/${centreId}/assessments`} className="text-sm text-portal-700 hover:underline">
          Back to Assessments
        </Link>
      </div>
    );
  }

  return <ClassAssessmentGrid centreId={centreId} grid={grid} frameworkKey={clientUser.centre_framework} />;
}
