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
  custom?: boolean;
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
  {
    id: 'custom',
    amount: 0,
    price: 0,
    custom: true,
    episodes: 'Choose your amount',
  },
];

interface CreditPackagesProps {
  onSuccess?: () => void;
}

export default function CreditPackages({ onSuccess }: CreditPackagesProps) {
  const [selectedPackage, setSelectedPackage] = useState<string>('pro');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { session } = useAuth();

  const parsedCustomAmount = Number(customAmount);
  const isCustomSelected = selectedPackage === 'custom';
  const isCustomValid = Number.isFinite(parsedCustomAmount) && parsedCustomAmount >= 5;
  const customValue = isCustomValid ? parsedCustomAmount : 0;

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
        body: JSON.stringify({
          packageId,
          customAmount: packageId === 'custom' ? customValue : undefined,
        }),
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

  const selected = isCustomSelected
    ? {
      id: 'custom',
      amount: customValue,
      price: customValue,
      bonus: 0,
    }
    : packages.find(p => p.id === selectedPackage);

  return (
    <div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5 mb-4">
        {packages.map((pkg) => (
          <button
            key={pkg.id}
            onClick={() => setSelectedPackage(pkg.id)}
            className={`relative p-4 rounded-xl border-2 transition-all text-left ${
              selectedPackage === pkg.id
                ? 'border-blue-500 bg-blue-900/20/50 shadow-sm'
                : 'border-slate-700 hover:border-slate-600 hover:shadow-sm'
            } ${pkg.popular ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
          >
            {pkg.popular && (
              <div className="absolute top-2 right-2 bg-blue-600 text-white px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Best
              </div>
            )}

            <div className="text-2xl font-bold text-slate-50 mb-1">
              {pkg.custom ? 'Custom' : `$${pkg.price}`}
            </div>

            {pkg.custom ? (
              <div className="mt-2">
                <label className="block text-[11px] text-slate-400 mb-1">Amount (min $5)</label>
                <input
                  type="number"
                  min={5}
                  step={1}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  onFocus={() => setSelectedPackage('custom')}
                  className={`w-full px-2.5 py-1.5 text-sm border rounded-lg bg-slate-900 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isCustomSelected && !isCustomValid && customAmount !== ''
                      ? 'border-red-500'
                      : 'border-slate-700'
                  }`}
                  placeholder="Enter amount"
                />
                <div className="mt-2 text-[11px] text-slate-500">
                  Credits match your dollar amount.
                </div>
              </div>
            ) : (
              <div className="text-[13px] text-slate-50 font-medium mb-1">
                ${pkg.amount} credits
                {pkg.bonus ? (
                  <span className="ml-1 inline-flex items-center rounded-full bg-emerald-900/40 text-emerald-300 px-1.5 py-0.5 text-[10px] font-semibold">
                    +${pkg.bonus}
                  </span>
                ) : null}
              </div>
            )}

            <div className="text-[11px] text-slate-400 mb-3">
              {pkg.episodes}
            </div>

            <div className="flex items-center gap-1 text-[11px] text-slate-500">
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
        disabled={isProcessing || (isCustomSelected && !isCustomValid)}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isProcessing
          ? 'Processing...'
          : isCustomSelected
            ? isCustomValid
              ? `Purchase $${customValue.toFixed(2)} — Get $${customValue.toFixed(2)} in Credits`
              : 'Enter a custom amount (min $5)'
            : `Purchase $${selected?.price ?? 0} — Get $${(selected?.amount ?? 0) + (selected?.bonus ?? 0)} in Credits`}
      </button>
    </div>
  );
}
