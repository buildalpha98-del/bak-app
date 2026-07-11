import { Skeleton } from "@/components/ui/skeleton";

// Two-pane inbox skeleton — mirrors CentreInbox's thread-list +
// conversation layout so the page doesn't jump when data lands.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid min-h-[60vh] grid-cols-1 gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-0 divide-y overflow-hidden rounded-2xl border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2.5 px-3.5 py-3">
              <Skeleton className="mt-0.5 h-4 w-4 rounded" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col overflow-hidden rounded-2xl border">
          <div className="space-y-1.5 border-b px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="flex flex-1 flex-col gap-2.5 p-4">
            <Skeleton className="h-14 w-2/3 self-start rounded-2xl" />
            <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
            <Skeleton className="h-14 w-3/5 self-start rounded-2xl" />
          </div>
          <div className="border-t p-3">
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
