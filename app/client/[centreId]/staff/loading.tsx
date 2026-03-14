import { SkeletonPageHeader, SkeletonCardGrid } from "@/components/shared/skeleton-patterns";
export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonCardGrid count={4} />
    </div>
  );
}
