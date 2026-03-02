'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/context';

type AdminUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  credits: {
    balance: number;
    lifetime_credits_added: number;
    lifetime_credits_spent: number;
    updated_at: string;
  } | null;
};

export default function AdminUsersPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) return;
      setLoading(true);
      const params = new URLSearchParams({
        search,
        page: String(page),
        perPage: String(pageSize),
      });
      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setUsers(json.users || []);
        setTotal(json.total || 0);
      }
      setLoading(false);
    };
    load();
  }, [session?.access_token, search, page, pageSize]);

  return (
    <div className="py-8">
      <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-2xl font-semibold text-white">Admin • Users</h1>
        <p className="mt-2 text-sm text-slate-400">Read-only user list with credit balances.</p>

        <div className="mt-6 flex flex-wrap gap-3 items-center">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search email"
            className="px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
          />
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
          >
            {[10, 30, 100, 200].map((size) => (
              <option key={size} value={size}>{size} items</option>
            ))}
          </select>
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60">
              <tr>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Balance</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Lifetime Added</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Lifetime Spent</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Created</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Last Sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-slate-400">Loading…</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-slate-400">No users found.</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 text-slate-200">{user.email}</td>
                    <td className="px-4 py-3 text-slate-200">
                      {user.credits ? `$${Number(user.credits.balance).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {user.credits ? `$${Number(user.credits.lifetime_credits_added).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {user.credits ? `$${Number(user.credits.lifetime_credits_spent).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2 py-1 rounded border border-slate-800 disabled:opacity-50"
          >
            Prev
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * pageSize >= total}
            className="px-2 py-1 rounded border border-slate-800 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
