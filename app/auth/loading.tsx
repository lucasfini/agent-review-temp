export default function AuthLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A] animate-in fade-in duration-200">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
        <p className="text-sm font-medium text-slate-400">Loading...</p>
      </div>
    </div>
  );
}
