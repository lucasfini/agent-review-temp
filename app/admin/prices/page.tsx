'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/context';

type EditableServicePrice = {
  serviceKey: string;
  providerRate: number;
  billedRate?: number;
  marginPercent?: number;
};

type EditableAnalysisPrice = {
  key: string;
  multiplier: number;
  minimumCharge: number;
};

type EditablePriceConfig = {
  services: Record<string, EditableServicePrice>;
  analysis: Record<string, EditableAnalysisPrice>;
  contentOutputs: Record<string, number>;
};

type Message = { type: 'success' | 'error'; text: string };

function formatUsd(value: number) {
  if (!Number.isFinite(value)) return '$0.000000';
  return `$${value.toFixed(6)}`;
}

function rateToPerMillion(rate: number) {
  return Number((rate * 1_000_000).toFixed(6));
}

function rateToPerHour(rate: number) {
  return Number((rate * 3600).toFixed(6));
}

function serviceDisplayUnit(serviceKey: string) {
  return serviceKey === 'assemblyai_transcription' ? 'hour' : '1M tokens';
}

function displayRate(serviceKey: string, rate?: number) {
  if (rate === undefined) return '';
  return serviceKey === 'assemblyai_transcription'
    ? String(rateToPerHour(rate))
    : String(rateToPerMillion(rate));
}

function parseDisplayRate(serviceKey: string, value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return serviceKey === 'assemblyai_transcription'
    ? parsed / 3600
    : parsed / 1_000_000;
}

export default function AdminPricesPage() {
  const { session } = useAuth();
  const [config, setConfig] = useState<EditablePriceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const serviceRows = useMemo(() => Object.values(config?.services || {}), [config]);
  const analysisRows = useMemo(() => Object.values(config?.analysis || {}), [config]);
  const contentRows = useMemo(() => Object.entries(config?.contentOutputs || {}), [config]);

  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) return;
      setLoading(true);
      setMessage(null);
      try {
        const res = await fetch('/api/admin/billing/prices', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load prices');
        setConfig(data.config);
      } catch (error: any) {
        setMessage({ type: 'error', text: error?.message || 'Failed to load prices' });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [session?.access_token]);

  const updateService = (serviceKey: string, patch: Partial<EditableServicePrice>) => {
    setConfig((current) => {
      if (!current) return current;
      return {
        ...current,
        services: {
          ...current.services,
          [serviceKey]: {
            ...current.services[serviceKey],
            ...patch,
          },
        },
      };
    });
  };

  const updateAnalysis = (key: string, patch: Partial<EditableAnalysisPrice>) => {
    setConfig((current) => {
      if (!current) return current;
      return {
        ...current,
        analysis: {
          ...current.analysis,
          [key]: {
            ...current.analysis[key],
            ...patch,
          },
        },
      };
    });
  };

  const updateContent = (key: string, value: number) => {
    setConfig((current) => {
      if (!current) return current;
      return {
        ...current,
        contentOutputs: {
          ...current.contentOutputs,
          [key]: value,
        },
      };
    });
  };

  const save = async () => {
    if (!session?.access_token || !config) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/billing/prices', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save prices');
      setConfig(data.config);
      setMessage({ type: 'success', text: 'Prices saved. New backend billing requests will use these values.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Failed to save prices' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-8">
      <div className="max-w-6xl mx-auto px-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">Admin • Prices</h1>
            <p className="mt-2 text-sm text-slate-400">
              Edit billing rates used by credit checks, reservations, and usage settlement.
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving || loading || !config}
            className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save prices'}
          </button>
        </div>

        {message && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-700/40 bg-emerald-900/20 text-emerald-300'
              : 'border-red-700/40 bg-red-900/20 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
            Loading prices...
          </div>
        ) : config ? (
          <>
            <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="text-base font-semibold text-white">Provider and Billed Rates</h2>
                <p className="mt-1 text-xs text-slate-500">Token models are entered per 1M tokens. Transcription is entered per hour.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Service</th>
                      <th className="px-4 py-3 text-left">Unit</th>
                      <th className="px-4 py-3 text-left">Provider rate</th>
                      <th className="px-4 py-3 text-left">Billed rate</th>
                      <th className="px-4 py-3 text-left">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {serviceRows.map((service) => (
                      <tr key={service.serviceKey}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-200">{service.serviceKey}</td>
                        <td className="px-4 py-3 text-slate-400">{serviceDisplayUnit(service.serviceKey)}</td>
                        <td className="px-4 py-3">
                          <input
                            value={displayRate(service.serviceKey, service.providerRate)}
                            onChange={(event) => updateService(service.serviceKey, {
                              providerRate: parseDisplayRate(service.serviceKey, event.target.value),
                            })}
                            className="w-28 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={displayRate(service.serviceKey, service.billedRate)}
                            placeholder={formatUsd(service.providerRate * (1 + Number(service.marginPercent || 0) / 100))}
                            onChange={(event) => updateService(service.serviceKey, {
                              billedRate: parseDisplayRate(service.serviceKey, event.target.value),
                            })}
                            className="w-28 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={String(service.marginPercent ?? 0)}
                            onChange={(event) => updateService(service.serviceKey, {
                              marginPercent: Math.max(0, Number(event.target.value) || 0),
                            })}
                            className="w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800">
                  <h2 className="text-base font-semibold text-white">Analysis Add-ons</h2>
                </div>
                <div className="divide-y divide-slate-800">
                  {analysisRows.map((row) => (
                    <div key={row.key} className="grid grid-cols-3 gap-3 px-5 py-3 items-center">
                      <div className="font-medium text-slate-200">{row.key}</div>
                      <input
                        value={String(row.multiplier)}
                        onChange={(event) => updateAnalysis(row.key, { multiplier: Math.max(0, Number(event.target.value) || 0) })}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
                        aria-label={`${row.key} multiplier`}
                      />
                      <input
                        value={String(row.minimumCharge)}
                        onChange={(event) => updateAnalysis(row.key, { minimumCharge: Math.max(0, Number(event.target.value) || 0) })}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
                        aria-label={`${row.key} minimum charge`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800">
                  <h2 className="text-base font-semibold text-white">Content Output Holds</h2>
                </div>
                <div className="divide-y divide-slate-800">
                  {contentRows.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[1fr_120px] gap-3 px-5 py-3 items-center">
                      <div className="font-medium text-slate-200">{key}</div>
                      <input
                        value={String(value)}
                        onChange={(event) => updateContent(key, Math.max(0, Number(event.target.value) || 0))}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
                        aria-label={`${key} price`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
