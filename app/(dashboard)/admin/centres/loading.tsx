import {
  SkeletonPageHeader,
  SkeletonCardGrid,
} from "@/components/shared/skeleton-patterns";

export default function CentresLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonCardGrid />
    </div>
  );
}
