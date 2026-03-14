import { SkeletonPageHeader, SkeletonList } from "@/components/shared/skeleton-patterns";
export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonList count={6} />
    </div>
  );
}
