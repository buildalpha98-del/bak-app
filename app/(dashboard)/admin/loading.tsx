import {
  SkeletonPageHeader,
  SkeletonStatsRow,
  SkeletonCardGrid,
} from "@/components/shared/skeleton-patterns";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonStatsRow count={4} />
      <SkeletonCardGrid count={4} />
    </div>
  );
}
