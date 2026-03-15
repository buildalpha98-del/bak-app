import {
  SkeletonPageHeader,
  SkeletonTable,
} from "@/components/shared/skeleton-patterns";

export default function StaffLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonTable />
    </div>
  );
}
