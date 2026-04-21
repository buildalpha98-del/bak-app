import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonPageHeader() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

export function SkeletonStatsRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border p-4 space-y-2"
        >
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 border-b border-border bg-muted/30 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
          style={{ animationDelay: `${rowIdx * 75}ms` }}
        >
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          {Array.from({ length: cols - 1 }).map((_, colIdx) => (
            <Skeleton
              key={colIdx}
              className="h-4 flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border p-4 space-y-3"
          style={{ animationDelay: `${i * 75}ms` }}
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
          <Skeleton className="h-12 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonDetailPage() {
  return (
    <div className="space-y-6">
      {/* Back button + title */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      </div>
      {/* Detail card */}
      <div className="rounded-xl border border-border p-5 space-y-4">
        <Skeleton className="h-5 w-36" />
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded shrink-0" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded shrink-0" />
            <Skeleton className="h-4 w-44" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded shrink-0" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </div>
      {/* Content section */}
      <div className="rounded-xl border border-border p-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border p-4"
          style={{ animationDelay: `${i * 75}ms` }}
        >
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}
