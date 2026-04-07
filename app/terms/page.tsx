import { SUPPORT_EMAIL } from '@/lib/site-config';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-slate-700 dark:bg-slate-950 dark:text-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-6">Terms of Service</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Effective date: April 7, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">1. Agreement</h2>
            <p>
              By creating an account or using AudioRepurpose, you agree to these Terms. If you do not agree, do not use the
              service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">2. Service Description</h2>
            <p>
              AudioRepurpose provides tools to upload audio/video, transcribe content, identify speakers, and generate
              derivative content. Features may change or be updated over time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">3. Your Content</h2>
            <p>
              You retain ownership of the content you upload. You grant us a limited license to process and analyze your
              content solely to provide the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">4. Acceptable Use</h2>
            <p>
              You agree not to upload illegal, infringing, or harmful content, and not to use the service to violate the
              rights of others.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">5. AI Processing</h2>
            <p>
              The service uses third-party AI providers (including OpenAI) to process audio, transcripts, and related
              metadata as part of delivering AudioRepurpose features.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">6. Payments</h2>
            <p>
              Credits are sold on a pay-as-you-go basis. All sales are final unless required by law. Payment processing is
              handled by Stripe.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">7. Termination</h2>
            <p>
              We may suspend or terminate accounts that violate these Terms. You may stop using the service at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">8. Disclaimers</h2>
            <p>
              The service is provided “as is” without warranties of any kind. We do not guarantee uninterrupted or error-free
              operation.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">9. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, AudioRepurpose will not be liable for indirect, incidental, or
              consequential damages.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">10. Changes</h2>
            <p>
              We may update these Terms from time to time. Continued use of the service constitutes acceptance of the
              updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">11. Contact</h2>
            <p>
              For questions about these Terms, contact us at {SUPPORT_EMAIL}.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
