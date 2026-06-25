'use client';

/**
 * Credit Packages Component
 * Display credit purchase packages with Stripe integration
 */

import { useState } from 'react';
import { Check, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/context';
import { formatProductCredits } from '@/lib/billing/product-credits';
import { useCurrentSubscription } from '@/lib/hooks/useCurrentSubscription';
import { CREDIT_PACKAGES, getTotalCredits, type CreditPackageId } from '@/lib/billing/credit-packages';

interface PackageOption {
  id: CreditPackageId;
  credits: number;
  price: number;
  expiresAfterMonths: number;
  popular?: boolean;
  label: string;
}

const packages: PackageOption[] = [
  {
    id: 'top_up_1000',
    ...CREDIT_PACKAGES.top_up_1000,
    label: 'Good for shorter batches',
  },
  {
    id: 'top_up_5000',
    ...CREDIT_PACKAGES.top_up_5000,
    popular: true,
    label: 'Best for recurring workflows',
  },
  {
    id: 'top_up_15000',
    ...CREDIT_PACKAGES.top_up_15000,
    label: 'For heavy content periods',
  },
];

interface CreditPackagesProps {
  organizationId?: string | null;
}

export default function CreditPackages({ organizationId }: CreditPackagesProps) {
  const [selectedPackage, setSelectedPackage] = useState<CreditPackageId>('top_up_5000');
  const [isProcessing, setIsProcessing] = useState(false);
  const { session } = useAuth();
  const { subscription, loading: loadingSubscription } = useCurrentSubscription(organizationId);
  const topUpsEnabled = Boolean(subscription?.plan?.topUpEnabled);

  const handlePurchase = async (packageId: CreditPackageId) => {
    setIsProcessing(true);
    try {
      if (!session?.access_token) {
        toast.error('Please log in to purchase credits.');
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
          organization_id: organizationId || undefined,
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
      toast.error(error instanceof Error ? error.message : 'Failed to initiate checkout. Please try again.');
      setIsProcessing(false);
    }
  };

  const selected = packages.find(p => p.id === selectedPackage);

  return (
    <div>
      {!loadingSubscription && !topUpsEnabled && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          Top-ups are available on paid plans. Upgrade from Free to buy additional credits.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3 mb-4">
        {packages.map((pkg) => (
          <button
            key={pkg.id}
            onClick={() => setSelectedPackage(pkg.id)}
            className={`relative p-4 rounded-xl border-2 transition-all text-left ${
              selectedPackage === pkg.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 hover:shadow-sm'
            } ${pkg.popular ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
          >
            {pkg.popular && (
              <div className="absolute top-2 right-2 bg-blue-600 text-white px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Best
              </div>
            )}

            <div className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-1">
              ${pkg.price}
            </div>

            <div className="text-[13px] text-slate-800 dark:text-slate-50 font-medium mb-1">
              {formatProductCredits(getTotalCredits(pkg))} credits
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
              {pkg.label}
            </div>

            <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-500">
              <Check className="h-3 w-3" />
              Expires after {pkg.expiresAfterMonths} months
            </div>

            {selectedPackage === pkg.id && (
              <div className="absolute bottom-2 right-2">
                <div className="bg-blue-500 rounded-full p-0.5">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Top-ups are consumed after rollover and current monthly credits.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          Secure payment via Stripe
        </p>
      </div>

      <button
        onClick={() => handlePurchase(selectedPackage)}
        disabled={isProcessing || loadingSubscription || !topUpsEnabled}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isProcessing
          ? 'Processing...'
          : !topUpsEnabled
            ? 'Upgrade to buy top-ups'
            : `Purchase $${selected?.price ?? 0} - Get ${formatProductCredits(selected ? getTotalCredits(selected) : 0)} credits`}
      </button>
    </div>
  );
}
