import { Skeleton } from "@/components/ui/skeleton";

export default function UploadLoading() {
  return (
    <div className="p-6 max-w-6xl mx-auto animate-in fade-in duration-200">
      {/* Header */}
      <div className="mb-8 space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="flex gap-8 items-start">
        {/* Main upload area */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Drag-and-drop zone */}
          <Skeleton className="h-[400px] w-full rounded-2xl border border-dashed border-slate-700 bg-transparent" />

          {/* Options row */}
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>

          {/* Action button */}
          <Skeleton className="h-11 w-40 rounded-lg" />
        </div>

        {/* Tips sidebar */}
        <div className="w-52 flex-shrink-0 hidden lg:block">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
