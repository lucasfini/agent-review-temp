/**
 * Cost Analysis Loading Skeleton
 */

export function CostSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="h-8 w-48 bg-slate-700 rounded" />
        <div className="flex gap-2">
          <div className="h-10 w-24 bg-slate-700 rounded" />
          <div className="h-10 w-24 bg-slate-700 rounded" />
          <div className="h-10 w-24 bg-slate-700 rounded" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-slate-900 p-6 rounded-lg shadow space-y-2">
            <div className="h-4 w-20 bg-slate-700 rounded" />
            <div className="h-8 w-32 bg-slate-700 rounded" />
            <div className="h-3 w-24 bg-slate-700 rounded" />
          </div>
        ))}
      </div>

      {/* Chart Section */}
      <div className="bg-slate-900 p-6 rounded-lg shadow space-y-4">
        <div className="h-6 w-40 bg-slate-700 rounded" />
        <div className="h-64 bg-slate-800 rounded" />
      </div>

      {/* Top Drivers Section */}
      <div className="bg-slate-900 p-6 rounded-lg shadow space-y-4">
        <div className="h-6 w-32 bg-slate-700 rounded" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex justify-between items-center">
              <div className="h-4 w-40 bg-slate-700 rounded" />
              <div className="h-4 w-24 bg-slate-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
