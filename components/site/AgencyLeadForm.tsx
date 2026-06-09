"use client";

import { useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';

import { agencyOffers } from '@/lib/public-agency-content';
import { trackAgencyFunnelEvent } from '@/lib/agency-funnel-client';

type FormState = {
  name: string;
  email: string;
  company: string;
  website: string;
  role: string;
  packageInterest: string;
  timeline: string;
  budgetRange: string;
  message: string;
  referralCode: string;
};

const emptyForm: FormState = {
  name: '',
  email: '',
  company: '',
  website: '',
  role: '',
  packageInterest: '',
  timeline: '',
  budgetRange: '',
  message: '',
  referralCode: '',
};

const timelineOptions = [
  'This month',
  'Next 1-2 months',
  'This quarter',
  'Just researching',
] as const;

const budgetOptions = [
  'Under $2k/mo',
  '$2k-$5k/mo',
  '$5k-$10k/mo',
  '$10k+/mo',
  'Not sure yet',
] as const;

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-neutral-800">
      {children}
    </label>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
      className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/15"
    />
  );
}

function SelectInput({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/15"
    >
      {children}
    </select>
  );
}

export default function AgencyLeadForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultPackage = searchParams.get('package') || '';
  const [form, setForm] = useState<FormState>({
    ...emptyForm,
    packageInterest: defaultPackage,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intakeStartedRef = useRef(false);

  const selectedOffer = useMemo(
    () => agencyOffers.find((offer) => offer.id === form.packageInterest),
    [form.packageInterest]
  );

  const updateField = (field: keyof FormState, value: string) => {
    if (!intakeStartedRef.current && field !== 'referralCode') {
      intakeStartedRef.current = true;
      trackAgencyFunnelEvent('agency_intake_started', {
        metadata: {
          field,
          formId: 'agency_lead_form',
          source: 'public_agency_site',
        },
      });
    }

    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/agency-leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          source: 'agency_website',
          metadata: {
            page: '/agency/contact',
            selectedOfferTitle: selectedOffer?.title || null,
          },
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to submit agency inquiry');
      }

      router.push('/agency/thank-you');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to submit agency inquiry';
      setError(message);
      trackAgencyFunnelEvent('agency_intake_validation_error', {
        metadata: {
          error: message,
          errorType: 'submission_error',
          formId: 'agency_lead_form',
          source: 'public_agency_site',
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="agency-lead-name">Name</FieldLabel>
          <TextInput
            id="agency-lead-name"
            value={form.name}
            onChange={(value) => updateField('name', value)}
            placeholder="Your name"
          />
        </div>
        <div>
          <FieldLabel htmlFor="agency-lead-email">Email</FieldLabel>
          <TextInput
            id="agency-lead-email"
            type="email"
            value={form.email}
            onChange={(value) => updateField('email', value)}
            placeholder="you@company.com"
            required
          />
        </div>
        <div>
          <FieldLabel htmlFor="agency-lead-company">Company</FieldLabel>
          <TextInput
            id="agency-lead-company"
            value={form.company}
            onChange={(value) => updateField('company', value)}
            placeholder="Company"
          />
        </div>
        <div>
          <FieldLabel htmlFor="agency-lead-website">Website</FieldLabel>
          <TextInput
            id="agency-lead-website"
            value={form.website}
            onChange={(value) => updateField('website', value)}
            placeholder="https://company.com"
          />
        </div>
        <div>
          <FieldLabel htmlFor="agency-lead-role">Role</FieldLabel>
          <TextInput
            id="agency-lead-role"
            value={form.role}
            onChange={(value) => updateField('role', value)}
            placeholder="Founder, marketing, success, ops"
          />
        </div>
        <div>
          <FieldLabel htmlFor="agency-lead-package">Package interest</FieldLabel>
          <SelectInput
            id="agency-lead-package"
            value={form.packageInterest}
            onChange={(value) => updateField('packageInterest', value)}
          >
            <option value="">Not sure yet</option>
            {agencyOffers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.title}
              </option>
            ))}
          </SelectInput>
        </div>
        <div>
          <FieldLabel htmlFor="agency-lead-timeline">Timeline</FieldLabel>
          <SelectInput
            id="agency-lead-timeline"
            value={form.timeline}
            onChange={(value) => updateField('timeline', value)}
          >
            <option value="">Select timeline</option>
            {timelineOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SelectInput>
        </div>
        <div>
          <FieldLabel htmlFor="agency-lead-budget">Budget range</FieldLabel>
          <SelectInput
            id="agency-lead-budget"
            value={form.budgetRange}
            onChange={(value) => updateField('budgetRange', value)}
          >
            <option value="">Select budget range</option>
            {budgetOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SelectInput>
        </div>
      </div>

      <div className="mt-4">
        <FieldLabel htmlFor="agency-lead-message">What should this help you turn into output?</FieldLabel>
        <textarea
          id="agency-lead-message"
          value={form.message}
          onChange={(event) => updateField('message', event.target.value)}
          rows={6}
          placeholder="Calls, meetings, customer updates, support themes, product launches, founder notes, or another communication bottleneck."
          className="mt-1 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm leading-6 text-neutral-950 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/15"
        />
      </div>

      <div className="hidden" aria-hidden="true">
        <label htmlFor="agency-lead-referral-code">Referral code</label>
        <input
          id="agency-lead-referral-code"
          name="referralCode"
          value={form.referralCode}
          onChange={(event) => updateField('referralCode', event.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-500 sm:w-auto"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {submitting ? 'Submitting' : 'Submit agency inquiry'}
      </button>
    </form>
  );
}
