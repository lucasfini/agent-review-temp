'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth/context';

type AdminUser = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil?: string | null;
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
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [banDurationByUser, setBanDurationByUser] = useState<Record<string, '24h' | '7d'>>({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      } else {
        const data = await res.json().catch(() => null);
        setMessage({ type: 'error', text: data?.error || 'Failed to load users' });
      }
      setLoading(false);
    };
    load();
  }, [session?.access_token, search, page, pageSize]);

  const refreshUsers = async () => {
    if (!session?.access_token) return;
    const params = new URLSearchParams({
      search,
      page: String(page),
      perPage: String(pageSize),
    });
    const res = await fetch(`/api/admin/users?${params.toString()}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return;
    const json = await res.json();
    setUsers(json.users || []);
    setTotal(json.total || 0);
  };

  const sendInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.access_token || !inviteEmail.trim()) return;

    setInviteLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to send invite');

      setInviteEmail('');
      setMessage({ type: 'success', text: data?.message || 'Invite sent' });
      await refreshUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to send invite' });
    } finally {
      setInviteLoading(false);
    }
  };

  const applyUserAction = async (
    userId: string,
    action: 'ban' | 'unban' | 'block'
  ) => {
    if (!session?.access_token) return;

    let confirmText = '';
    if (action === 'unban') {
      confirmText = 'Unban this user and allow login again?';
    } else if (action === 'block') {
      confirmText = 'Block this user (effectively permanent login ban)?';
    } else {
      const duration = banDurationByUser[userId] || '24h';
      confirmText = `Ban this user for ${duration}?`;
    }
    if (!window.confirm(confirmText)) return;

    setActionLoadingId(userId);
    setMessage(null);
    try {
      const payload: any = { action };
      if (action === 'ban') payload.duration = banDurationByUser[userId] || '24h';

      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update user status');

      setMessage({ type: 'success', text: data?.message || 'User updated' });
      await refreshUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to update user status' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusLabel = (user: AdminUser) => {
    if (!user.bannedUntil) return { text: 'Active', style: 'text-emerald-400' };
    const dt = new Date(user.bannedUntil);
    if (Number.isNaN(dt.getTime())) return { text: 'Restricted', style: 'text-amber-400' };
    if (dt.getTime() > Date.now()) {
      const isFarFuture = dt.getTime() - Date.now() > 365 * 24 * 60 * 60 * 1000;
      return {
        text: isFarFuture ? 'Blocked' : `Banned until ${dt.toLocaleDateString()}`,
        style: isFarFuture ? 'text-red-400' : 'text-amber-400',
      };
    }
    return { text: 'Active', style: 'text-emerald-400' };
  };

  return (
    <div className="py-8">
      <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-2xl font-semibold text-white">Admin • Users</h1>
        <p className="mt-2 text-sm text-slate-400">User list with credit balances and access controls.</p>

        {message && (
          <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            message.type === 'success'
              ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300'
              : 'border-red-700/40 bg-red-900/20 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        <form
          onSubmit={sendInvite}
          className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4"
        >
          <label htmlFor="invite-email" className="block text-sm font-medium text-slate-200">
            Invite user
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="new-user@example.com"
              className="min-w-0 flex-1 px-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-800 text-slate-200"
              disabled={inviteLoading}
              required
            />
            <button
              type="submit"
              disabled={inviteLoading || !inviteEmail.trim()}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {inviteLoading ? 'Sending...' : 'Send invite'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Invited users receive the Supabase invite email and land on the password setup page.
          </p>
        </form>

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
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-slate-400">Loading…</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-slate-400">No users found.</td>
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
                    <td className={`px-4 py-3 text-xs font-medium ${getStatusLabel(user).style}`}>
                      {getStatusLabel(user).text}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={banDurationByUser[user.id] || '24h'}
                          onChange={(e) =>
                            setBanDurationByUser((prev) => ({
                              ...prev,
                              [user.id]: e.target.value as '24h' | '7d',
                            }))
                          }
                          className="px-2 py-1 text-xs rounded-md bg-slate-900 border border-slate-700 text-slate-200"
                          disabled={actionLoadingId === user.id}
                        >
                          <option value="24h">24h</option>
                          <option value="7d">7d</option>
                        </select>
                        <button
                          onClick={() => applyUserAction(user.id, 'ban')}
                          disabled={actionLoadingId === user.id}
                          className="px-2 py-1 text-xs rounded border border-amber-700/40 text-amber-300 hover:bg-amber-900/20 disabled:opacity-50"
                        >
                          Ban
                        </button>
                        <button
                          onClick={() => applyUserAction(user.id, 'block')}
                          disabled={actionLoadingId === user.id}
                          className="px-2 py-1 text-xs rounded border border-red-700/40 text-red-300 hover:bg-red-900/20 disabled:opacity-50"
                        >
                          Block
                        </button>
                        <button
                          onClick={() => applyUserAction(user.id, 'unban')}
                          disabled={actionLoadingId === user.id}
                          className="px-2 py-1 text-xs rounded border border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/20 disabled:opacity-50"
                        >
                          Unban
                        </button>
                      </div>
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
