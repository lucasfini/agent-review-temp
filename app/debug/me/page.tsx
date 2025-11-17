/**
 * Debug Page - Shows Current User Info
 */

'use client';

import { useAuth } from '@/lib/auth/context';

export default function DebugMePage() {
  const { user, session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-600">Not logged in</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6">Current User Info</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              User ID (copy this!)
            </label>
            <div className="bg-gray-100 p-3 rounded border border-gray-300 font-mono text-sm break-all">
              {user.id}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(user.id)}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700"
            >
              📋 Copy to clipboard
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <div className="bg-gray-100 p-3 rounded border border-gray-300 font-mono text-sm">
              {user.email}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Created At
            </label>
            <div className="bg-gray-100 p-3 rounded border border-gray-300 text-sm">
              {new Date(user.created_at).toLocaleString()}
            </div>
          </div>

          {session && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Session Valid
              </label>
              <div className="bg-green-100 p-3 rounded border border-green-300 text-sm text-green-800">
                ✓ Yes - Session active
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 pt-6 border-t">
          <h2 className="font-semibold mb-2">Next Steps:</h2>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
            <li>Copy your User ID above</li>
            <li>Open the file: <code className="bg-gray-100 px-1">add_test_credits.sql</code></li>
            <li>Replace <code className="bg-gray-100 px-1">'your-user-id-here'</code> with your User ID (in both places)</li>
            <li>Run the SQL in Supabase SQL Editor</li>
            <li>Refresh your settings page to see the credits</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
