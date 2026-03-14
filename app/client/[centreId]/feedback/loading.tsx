import { SkeletonPageHeader, SkeletonStatsRow, SkeletonList } from "@/components/shared/skeleton-patterns";
export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonStatsRow count={1} />
      <SkeletonList count={5} />
    </div>
  );
}
