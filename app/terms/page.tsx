import { SUPPORT_EMAIL } from '@/lib/site-config';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-slate-700 dark:bg-slate-950 dark:text-slate-200">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:px-6 sm:py-12">
        <h1 className="mb-6 text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">Terms of Service</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Last updated: May 11, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">1. Acceptance of Terms</h2>
            <p>
              By creating an account or using AudioRepurpose, you agree to these Terms. If you do not agree, do not use the
              service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">2. Description of the Service</h2>
            <p>
              AudioRepurpose provides tools to upload or import recordings, transcribe content, identify/review speakers, and
              generate derivative outputs (such as summaries and social-ready drafts). Features, processing tiers, and model
              providers may change over time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">3. Eligibility</h2>
            <p>
              You must be able to form a binding agreement and comply with applicable laws to use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">4. Accounts and User Responsibilities</h2>
            <p>
              You are responsible for maintaining account credentials, providing accurate information, and all activity under
              your account. You are also responsible for securing rights and permissions for files you upload or import.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">5. Acceptable Use</h2>
            <p>
              You may not use the service for unlawful, infringing, abusive, deceptive, or harmful conduct, including uploading
              content you do not have rights to use, attempting unauthorized access, interfering with platform operation, or
              violating third-party terms connected through integrations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">6. User Content and Uploads</h2>
            <p>
              You retain ownership of your content. You grant AudioRepurpose a limited license to host, transmit, process, and
              transform your content solely to operate and improve the service features you request. You are responsible for
              the legality and accuracy of what you upload.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">7. Purchases, Payments, and Refund Handling</h2>
            <p>
              The app uses a prepaid credit model with Stripe Checkout for purchases. Payment processing is handled by Stripe.
              The service may adjust credits when Stripe reports refunds or payment corrections. Unless required by law or
              separately stated, purchases are treated as final.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">8. Third-Party Services</h2>
            <p>
              The service depends on third-party providers (for example Supabase, Stripe, AssemblyAI, OpenAI, Anthropic,
              Deepgram fallback, Cloudflare R2, Resend, Zoom, Microsoft). Your use of connected third-party services may also
              be subject to those providers&apos; terms and policies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">9. Intellectual Property</h2>
            <p>
              AudioRepurpose and its platform materials, software, branding, and non-user content are protected by intellectual
              property laws. These Terms do not transfer ownership of our intellectual property to you.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">10. Service Availability and Changes</h2>
            <p>
              We may modify, pause, or discontinue features, providers, workflows, or limits at any time. We do not guarantee
              uninterrupted availability, specific model behavior, or error-free operation.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">11. Termination or Suspension</h2>
            <p>
              We may suspend or terminate access for violations of these Terms, abuse, security risks, fraud concerns, or legal
              requirements. You may stop using the service at any time and may request account deletion through available
              product flows.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">12. Disclaimers</h2>
            <p>
              The service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind to the extent permitted by
              law. AI-generated outputs can contain errors and should be reviewed before publication or reliance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">13. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, AudioRepurpose will not be liable for indirect, incidental, special,
              consequential, or punitive damages, or for loss of profits, data, goodwill, or business interruption.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">14. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless AudioRepurpose from claims, liabilities, damages, and expenses arising
              from your content, your use of the service, or your violation of these Terms or applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">15. Governing Law</h2>
            <p>
              These Terms are governed by the laws of [Jurisdiction], without regard to conflict-of-law rules.
            </p>
            {/* TODO(legal): Replace [Jurisdiction] with the correct governing law and venue. */}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">16. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of the service after updates are posted means you
              accept the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">17. Contact Information</h2>
            <p>
              For questions about these Terms, contact us at {SUPPORT_EMAIL}.
            </p>
            {/* TODO(legal): If required, add [Company Legal Name] and [Business Address]. */}
          </section>
        </div>
      </div>
    </div>
  );
}
