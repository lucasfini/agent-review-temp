'use client';

/**
 * Credit Packages Component
 * Display credit purchase packages with Stripe integration
 */

import { useState } from 'react';
import { Check, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';

interface Package {
  id: string;
  amount: number;
  price: number;
  popular?: boolean;
  bonus?: number;
  bonusPercent?: string;
  episodes?: string;
}

const packages: Package[] = [
  {
    id: 'starter',
    amount: 10,
    price: 10,
    episodes: '~17-28 episodes',
  },
  {
    id: 'basic',
    amount: 25,
    price: 25,
    bonus: 2,
    bonusPercent: '+8%',
    episodes: '~45-75 episodes',
  },
  {
    id: 'pro',
    amount: 50,
    price: 50,
    popular: true,
    bonus: 5,
    bonusPercent: '+10%',
    episodes: '~92-150 episodes',
  },
  {
    id: 'enterprise',
    amount: 100,
    price: 100,
    bonus: 15,
    bonusPercent: '+15%',
    episodes: '~190-320 episodes',
  },
];

interface CreditPackagesProps {
  onSuccess?: () => void;
}

export default function CreditPackages({ onSuccess }: CreditPackagesProps) {
  const [selectedPackage, setSelectedPackage] = useState<string>('pro');
  const [isProcessing, setIsProcessing] = useState(false);
  const { session } = useAuth();

  const handlePurchase = async (packageId: string) => {
    setIsProcessing(true);
    try {
      if (!session?.access_token) {
        alert('Please log in to purchase credits');
        setIsProcessing(false);
        return;
      }

      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ packageId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create checkout session');
      }

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to initiate checkout. Please try again.');
      setIsProcessing(false);
    }
  };

  const selected = packages.find(p => p.id === selectedPackage);

  return (
    <div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 mb-4">
        {packages.map((pkg) => (
          <button
            key={pkg.id}
            onClick={() => setSelectedPackage(pkg.id)}
            className={`relative p-5 rounded-xl border-2 transition-all text-left ${
              selectedPackage === pkg.id
                ? 'border-blue-500 bg-blue-900/20/50 shadow-sm'
                : 'border-slate-700 hover:border-slate-600 hover:shadow-sm'
            } ${pkg.popular ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
          >
            {pkg.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-3 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Best Value
              </div>
            )}

            {pkg.bonusPercent && (
              <div className="absolute -top-2 -right-2 bg-green-500 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                {pkg.bonusPercent}
              </div>
            )}

            <div className="text-3xl font-bold text-slate-50 mb-1">
              ${pkg.price}
            </div>

            <div className="text-sm text-slate-50 font-medium mb-1">
              ${pkg.amount} credits
              {pkg.bonus ? (
                <span className="text-green-600 ml-1">+${pkg.bonus} bonus</span>
              ) : null}
            </div>

            <div className="text-xs text-slate-400 mb-3">
              {pkg.episodes}
            </div>

            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Check className="h-3 w-3" />
              No expiration
            </div>

            {selectedPackage === pkg.id && (
              <div className="absolute top-2 right-2">
                <div className="bg-blue-500 rounded-full p-0.5">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-400">
          Pay as you go — no subscriptions, credits never expire
        </p>
        <p className="text-xs text-slate-500">
          Secure payment via Stripe
        </p>
      </div>

      <button
        onClick={() => handlePurchase(selectedPackage)}
        disabled={isProcessing}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isProcessing
          ? 'Processing...'
          : `Purchase $${selected?.price ?? 0} — Get $${(selected?.amount ?? 0) + (selected?.bonus ?? 0)} in Credits`}
      </button>
    </div>
  );
}
