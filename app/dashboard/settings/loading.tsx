import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="p-3 sm:p-6 max-w-3xl space-y-8 animate-in fade-in duration-200">
      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-slate-800 pb-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-t-lg rounded-b-none" />
        ))}
      </div>

      {/* Form section */}
      <div className="space-y-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}

        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Danger zone */}
      <div className="pt-4 border-t border-slate-800 space-y-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}
