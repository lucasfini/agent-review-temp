'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/context';

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  processing_stage?: string | null;
  processing_progress?: number | null;
  processing_message?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export default function AdminMonitoringPage() {
  const { session } = useAuth();
  const [recent, setRecent] = useState<ProjectRow[]>([]);
  const [failed, setFailed] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'7d' | '30d' | '6m' | 'all'>('30d');
  const [search, setSearch] = useState('');
  const [recentPage, setRecentPage] = useState(1);
  const [failedPage, setFailedPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [recentTotal, setRecentTotal] = useState(0);
  const [failedTotal, setFailedTotal] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) return;
      setLoading(true);
      const params = new URLSearchParams({
        range,
        search,
        recentLimit: String(pageSize),
        recentOffset: String((recentPage - 1) * pageSize),
        failedLimit: String(pageSize),
        failedOffset: String((failedPage - 1) * pageSize),
      });
      const res = await fetch(`/api/admin/monitoring?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setRecent(json.recentProjects || []);
        setFailed(json.failedProjects || []);
        setRecentTotal(json.recentTotal || 0);
        setFailedTotal(json.failedTotal || 0);
      }
      setLoading(false);
    };
    load();
  }, [session?.access_token, range, search, recentPage, failedPage, pageSize]);

  return (
    <div className="py-8">
      <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-2xl font-semibold text-white">Admin • Monitoring</h1>
        <p className="mt-2 text-sm text-slate-400">
          System health, error rates, and processing throughput will live here.
        </p>

        <div className="mt-6 flex flex-wrap gap-3 items-center">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setRecentPage(1);
              setFailedPage(1);
            }}
            placeholder="Search by title"
            className="px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
          />
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value as any);
              setRecentPage(1);
              setFailedPage(1);
            }}
            className="px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
          >
            <option value="7d">7d</option>
            <option value="30d">30d</option>
            <option value="6m">6m</option>
            <option value="all">All time</option>
          </select>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setRecentPage(1);
              setFailedPage(1);
            }}
            className="px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
          >
            {[10, 30, 100, 200].map((size) => (
              <option key={size} value={size}>{size} items</option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <h2 className="text-sm font-semibold text-slate-200 mb-2">Recent Projects</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60">
                <tr>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Title</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Stage</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Progress</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-slate-400">Loading…</td></tr>
                ) : recent.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-slate-400">No recent projects.</td></tr>
                ) : (
                  recent.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 text-slate-200">{p.title}</td>
                      <td className="px-4 py-3 text-slate-400">{p.status}</td>
                      <td className="px-4 py-3 text-slate-400">{p.processing_stage || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{typeof p.processing_progress === 'number' ? `${p.processing_progress}%` : '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{p.updated_at ? new Date(p.updated_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
            <button
              onClick={() => setRecentPage((p) => Math.max(1, p - 1))}
              disabled={recentPage === 1}
              className="px-2 py-1 rounded border border-slate-800 disabled:opacity-50"
            >
              Prev
            </button>
            <span>
              Page {recentPage} of {Math.max(1, Math.ceil(recentTotal / pageSize))}
            </span>
            <button
              onClick={() => setRecentPage((p) => p + 1)}
              disabled={recentPage * pageSize >= recentTotal}
              className="px-2 py-1 rounded border border-slate-800 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-200 mb-2">Failed Projects</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60">
                <tr>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Title</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Stage</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Message</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-slate-400">Loading…</td></tr>
                ) : failed.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-slate-400">No failures.</td></tr>
                ) : (
                  failed.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 text-slate-200">{p.title}</td>
                      <td className="px-4 py-3 text-slate-400">{p.processing_stage || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{p.processing_message || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{p.updated_at ? new Date(p.updated_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
            <button
              onClick={() => setFailedPage((p) => Math.max(1, p - 1))}
              disabled={failedPage === 1}
              className="px-2 py-1 rounded border border-slate-800 disabled:opacity-50"
            >
              Prev
            </button>
            <span>
              Page {failedPage} of {Math.max(1, Math.ceil(failedTotal / pageSize))}
            </span>
            <button
              onClick={() => setFailedPage((p) => p + 1)}
              disabled={failedPage * pageSize >= failedTotal}
              className="px-2 py-1 rounded border border-slate-800 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
