"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import {
  LayoutGrid,
  Upload,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Mic,
  AlertCircle
} from 'lucide-react';

const navigation = [
  { name: 'Project Hub', href: '/dashboard/hub', icon: LayoutGrid },
  { name: 'Content Library', href: '/dashboard/projects', icon: FileText },
  { name: 'Upload', href: '/dashboard/upload', icon: Upload },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export default function DashboardNav() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { user, session, signOut } = useAuth();

  // Fetch user's credit balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!user || !session?.access_token) return;

      try {
        const response = await fetch('/api/billing/balance', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          setBalance(data.balance);
        }
      } catch (error) {
        console.error('Error fetching balance:', error);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [user, session]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const isLowBalance = balance !== null && balance < 5;
  const balanceDisplay = isLoadingBalance
    ? 'Loading...'
    : balance !== null
    ? `$${balance.toFixed(2)}`
    : 'Free Plan';

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <div className="flex flex-col flex-grow pt-5 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4">
            <Link href="/" className="flex items-center">
              <Mic className="h-8 w-8 text-blue-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">AudioRepurpose</span>
            </Link>
          </div>
          
          <div className="mt-8 flex-grow flex flex-col">
            <nav className="flex-1 px-2 space-y-1">
              {navigation.map((item) => {
                // Hub is active for both /dashboard and /dashboard/hub
                const isActive = item.href === '/dashboard/hub'
                  ? pathname === '/dashboard/hub' || pathname === '/dashboard'
                  : pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <item.icon
                      className={`mr-3 h-5 w-5 ${
                        isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
                      }`}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User section */}
          <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
            <div className="flex-shrink-0 w-full group block">
              <div className="flex items-center justify-between">
                <Link href="/dashboard/settings" className="flex items-center flex-1 min-w-0">
                  <div className="inline-block h-9 w-9 rounded-full bg-blue-500 flex-shrink-0">
                    <div className="h-9 w-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                      {user?.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                  </div>
                  <div className="ml-3 min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-700 truncate">
                      {user?.email}
                    </p>
                    <div className="flex items-center gap-1">
                      <p className={`text-xs font-medium ${isLowBalance ? 'text-red-600' : 'text-gray-500'}`}>
                        {balanceDisplay}
                      </p>
                      {isLowBalance && (
                        <AlertCircle className="h-3 w-3 text-red-600" />
                      )}
                    </div>
                  </div>
                </Link>
                <button
                  onClick={handleSignOut}
                  className="ml-3 flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu button */}
      <div className="md:hidden">
        <div className="flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3">
          <Link href="/" className="flex items-center">
            <Mic className="h-6 w-6 text-blue-600" />
            <span className="ml-2 text-lg font-bold text-gray-900">AudioRepurpose</span>
          </Link>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 flex z-40 md:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              >
                <X className="h-6 w-6 text-white" />
              </button>
            </div>
            
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="flex-shrink-0 flex items-center px-4">
                <Mic className="h-8 w-8 text-blue-600" />
                <span className="ml-2 text-xl font-bold text-gray-900">AudioRepurpose</span>
              </div>
              <nav className="mt-5 px-2 space-y-1">
                {navigation.map((item) => {
                  const isActive = item.href === '/dashboard/hub'
                    ? pathname === '/dashboard/hub' || pathname === '/dashboard'
                    : pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`group flex items-center px-2 py-2 text-base font-medium rounded-md ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <item.icon
                        className={`mr-4 h-6 w-6 ${
                          isActive ? 'text-blue-500' : 'text-gray-400'
                        }`}
                      />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </div>
            
            <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
              <div className="flex items-center justify-between w-full">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center flex-1 min-w-0"
                >
                  <div className="inline-block h-10 w-10 rounded-full bg-blue-500 flex-shrink-0">
                    <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium">
                      {user?.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                  </div>
                  <div className="ml-3 min-w-0 flex-1">
                    <p className="text-base font-medium text-gray-700 truncate">{user?.email}</p>
                    <div className="flex items-center gap-1">
                      <p className={`text-sm font-medium ${isLowBalance ? 'text-red-600' : 'text-gray-500'}`}>
                        {balanceDisplay}
                      </p>
                      {isLowBalance && (
                        <AlertCircle className="h-3 w-3 text-red-600" />
                      )}
                    </div>
                  </div>
                </Link>
                <button
                  onClick={handleSignOut}
                  className="ml-3 p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}