import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <div className="h-screen flex overflow-hidden animate-in fade-in duration-200">
      {/* Left sidebar — project list */}
      <div className="w-72 flex-shrink-0 border-r border-slate-800 flex flex-col gap-2 p-3">
        {/* Search bar */}
        <Skeleton className="h-8 w-full rounded-lg mb-1" />
        {/* Project rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Audio player bar */}
        <Skeleton className="h-12 w-full flex-shrink-0 rounded-none" />

        {/* Transcript header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 flex-shrink-0">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>

        {/* Transcript segments */}
        <div className="flex-1 overflow-hidden px-4 py-4 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className={`h-4 ${i % 2 === 0 ? 'w-4/5' : 'w-3/4'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
