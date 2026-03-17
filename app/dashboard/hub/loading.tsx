import { Skeleton } from "@/components/ui/skeleton";

export default function HubLoading() {
  return (
    <div className="p-3 sm:p-6 space-y-6 animate-in fade-in duration-200">
      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>

      {/* Recent activity feed */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-36" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
