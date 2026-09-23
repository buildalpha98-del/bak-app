import { notFound } from "next/navigation";
import { getTermSetup } from "@/lib/terms/setup-actions";
import { TermSetupView } from "@/components/roster/term-setup-view";

// Set up a term: roll last term's weekly pattern forward, then generate
// every week at once. Same screen for admin and ops.
export const dynamic = "force-dynamic";

export default async function TermSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await getTermSetup(id);
  if (error || !data) notFound();
  return <TermSetupView data={data} basePath="/ops/roster" />;
}
