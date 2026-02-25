/**
 * Transactions Ledger Loading Skeleton
 */

export function TransactionSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="h-8 w-48 bg-slate-700 rounded" />
        <div className="h-10 w-32 bg-slate-700 rounded" />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-slate-900 p-6 rounded-lg shadow space-y-2">
            <div className="h-4 w-24 bg-slate-700 rounded" />
            <div className="h-8 w-32 bg-slate-700 rounded" />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 h-10 bg-slate-700 rounded-lg" />
        <div className="h-10 w-40 bg-slate-700 rounded-lg" />
      </div>

      {/* Table */}
      <div className="bg-slate-900 rounded-lg shadow overflow-hidden">
        {/* Table Header */}
        <div className="bg-slate-800/50 px-6 py-3 flex gap-4">
          <div className="h-4 w-24 bg-slate-700 rounded" />
          <div className="h-4 w-40 bg-slate-700 rounded flex-1" />
          <div className="h-4 w-24 bg-slate-700 rounded" />
          <div className="h-4 w-24 bg-slate-700 rounded" />
          <div className="h-4 w-32 bg-slate-700 rounded" />
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-slate-800">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="px-6 py-4 flex gap-4">
              <div className="h-4 w-24 bg-slate-700 rounded" />
              <div className="h-4 w-40 bg-slate-700 rounded flex-1" />
              <div className="h-4 w-24 bg-slate-700 rounded" />
              <div className="h-4 w-20 bg-slate-700 rounded" />
              <div className="h-4 w-32 bg-slate-700 rounded" />
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="bg-slate-900 px-6 py-4 border-t border-slate-700 flex justify-between">
          <div className="h-4 w-48 bg-slate-700 rounded" />
          <div className="flex gap-2">
            <div className="h-8 w-20 bg-slate-700 rounded" />
            <div className="h-8 w-8 bg-slate-700 rounded" />
            <div className="h-8 w-8 bg-slate-700 rounded" />
            <div className="h-8 w-20 bg-slate-700 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
