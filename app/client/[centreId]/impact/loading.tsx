import { SkeletonPageHeader, SkeletonStatsRow, SkeletonCardGrid } from "@/components/shared/skeleton-patterns";
export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonStatsRow count={6} />
      <SkeletonCardGrid count={3} />
    </div>
  );
}
