'use client';

/**
 * Credit Packages Component
 * Display credit purchase packages with Stripe integration
 */

import { useState } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';

interface Package {
  id: string;
  amount: number;
  price: number;
  popular?: boolean;
  bonus?: number;
}

const packages: Package[] = [
  {
    id: 'starter',
    amount: 10,
    price: 10,
  },
  {
    id: 'basic',
    amount: 25,
    price: 25,
    bonus: 2,
  },
  {
    id: 'pro',
    amount: 50,
    price: 50,
    popular: true,
    bonus: 5,
  },
  {
    id: 'enterprise',
    amount: 100,
    price: 100,
    bonus: 15,
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
      // Get user's auth token from session
      if (!session?.access_token) {
        alert('Please log in to purchase credits');
        setIsProcessing(false);
        return;
      }

      // Create checkout session
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

      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to initiate checkout. Please try again.');
      setIsProcessing(false); // Only reset on error, not on redirect
    }
  };

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        {packages.map((pkg) => (
          <button
            key={pkg.id}
            onClick={() => setSelectedPackage(pkg.id)}
            className={`relative p-6 rounded-lg border-2 transition-all ${
              selectedPackage === pkg.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            } ${pkg.popular ? 'ring-2 ring-blue-500' : ''}`}
          >
            {pkg.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                Popular
              </div>
            )}

            <div className="text-center">
              <div className="text-3xl font-bold text-gray-900 mb-2">
                ${pkg.amount}
              </div>
              {pkg.bonus && (
                <div className="text-green-600 text-sm font-medium mb-2">
                  +${pkg.bonus} bonus
                </div>
              )}
              <div className="text-gray-500 text-sm mb-4">
                ${pkg.price}
              </div>

              <div className="text-xs text-gray-500 space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <Check className="h-3 w-3" />
                  Instant delivery
                </div>
                <div className="flex items-center justify-center gap-1">
                  <Check className="h-3 w-3" />
                  No expiration
                </div>
              </div>
            </div>

            {selectedPackage === pkg.id && (
              <div className="absolute top-2 right-2">
                <div className="bg-blue-500 rounded-full p-1">
                  <Check className="h-4 w-4 text-white" />
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="text-blue-600 font-bold">ℹ️</div>
          <div className="text-sm text-blue-800">
            <div className="font-medium mb-1">About Credits</div>
            <ul className="space-y-1">
              <li>• Credits are used for transcription and AI processing</li>
              <li>• Minimum purchase: $10 (Starter package)</li>
              <li>• No monthly fees or subscriptions</li>
              <li>• Pay only for what you use</li>
            </ul>
          </div>
        </div>
      </div>

      <button
        onClick={() => handlePurchase(selectedPackage)}
        disabled={isProcessing}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isProcessing ? 'Processing...' : `Purchase ${packages.find(p => p.id === selectedPackage)?.amount} Credits`}
      </button>

      <div className="mt-4 text-center text-xs text-gray-500">
        Secure payment powered by Stripe
      </div>
    </div>
  );
}
