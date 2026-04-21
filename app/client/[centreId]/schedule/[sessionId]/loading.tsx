import { SkeletonDetailPage } from "@/components/shared/skeleton-patterns";

export default function SessionDetailLoading() {
  return (
    <div className="animate-fade-up">
      <SkeletonDetailPage />
    </div>
  );
}
