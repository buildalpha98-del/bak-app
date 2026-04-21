import { SkeletonDetailPage } from "@/components/shared/skeleton-patterns";

export default function ProgramDetailLoading() {
  return (
    <div className="animate-fade-up">
      <SkeletonDetailPage />
    </div>
  );
}
