import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientProgramDetail } from "@/lib/client/portal-actions";
import { ProgramView } from "@/components/programs/program-view";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function ClientProgramDetailPage({
  params,
}: {
  params: Promise<{ centreId: string; programId: string }>;
}) {
  const { centreId, programId } = await params;
  const { data: clientUser } = await getCurrentClientUser();

  if (!clientUser || clientUser.centre_id !== centreId) {
    redirect("/client-login");
  }

  const { data: program, error } = await getClientProgramDetail(programId, centreId);

  if (error || !program) {
    redirect(`/client/${centreId}/programs`);
  }

  return (
    <div className="animate-fade-up space-y-4">
      <Link
        href={`/client/${centreId}/programs`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Programs
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {program.skill_focus ?? program.sport}
        </h1>
        <p className="text-sm text-gray-500">
          {program.sport} • Ages {program.age_group ?? "All"} •
          Delivered {program.times_used} time{program.times_used !== 1 ? "s" : ""}
        </p>
      </div>

      <ProgramView content={program.content_json} />
    </div>
  );
}
