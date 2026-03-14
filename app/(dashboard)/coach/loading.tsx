import {
  SkeletonPageHeader,
  SkeletonStatsRow,
  SkeletonList,
} from "@/components/shared/skeleton-patterns";

export default function CoachLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonStatsRow count={3} />
      <SkeletonList />
    </div>
  );
}
