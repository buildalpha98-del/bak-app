import { LoadError } from "@/components/ui/load-error";
import { CoverageBoardView } from "@/components/roster/coverage-board";
import { getCoverageBoard } from "@/lib/roster/coverage-actions";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

// The term board: centre × week coverage for this term or a coming one.
export const dynamic = "force-dynamic";

export default async function CoveragePage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const { term } = await searchParams;
  const { data, error } = await getCoverageBoard(term);
  if (error || !data) return <LoadError message={error ?? "Failed to load the term board."} />;
  return <CoverageBoardView board={data.board} term={data.term} terms={data.terms} today={sydneyTodayIso()} basePath="/ops/roster" />;
}
