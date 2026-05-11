import { PRIVACY_EMAIL } from '@/lib/site-config';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-slate-700 dark:bg-slate-950 dark:text-slate-200">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:px-6 sm:py-12">
        <h1 className="mb-6 text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">Privacy Policy</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Last updated: May 11, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">1. Overview</h2>
            <p>
              AudioRepurpose helps users upload audio or video and generate transcripts, speaker analysis, summaries, and
              repurposed content outputs. This Privacy Policy explains what information we collect, how we use it, and your
              choices. This policy is for product transparency and lawyer review and is not legal advice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">2. Information We Collect</h2>
            <p>
              We collect information you provide directly, information needed to run uploads and processing jobs, and limited
              technical/authentication data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">3. Information Users Provide</h2>
            <p>
              Depending on your usage, you may provide: account information (email, name, profile fields, avatar image),
              uploaded audio/video files, transcript and speaker edits, contact form submissions, waitlist form details, and
              settings (including optional personal OpenAI API key preferences).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">4. Information Collected Automatically</h2>
            <p>
              We process technical and service metadata such as authentication/session information, upload and processing
              status, usage and billing records, integration connection metadata, and basic request/security data needed to run
              the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">5. Cookies and Similar Technologies</h2>
            <p>
              The app uses cookies and browser storage for core functionality (for example: authentication/session handling,
              temporary OAuth state for Zoom/Microsoft connection flows, and signup consent capture). The app also uses
              browser storage such as localStorage/IndexedDB for upload queue continuity. We did not find ad-tech or marketing
              pixel tooling in this codebase.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">6. How We Use Information</h2>
            <p>
              We use information to create and secure accounts, process uploads, generate transcripts and AI outputs, manage
              billing and credits, support imports/integrations, respond to support requests, run account lifecycle actions
              (including deletion), and operate/administer the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">7. How We Share Information</h2>
            <p>
              We do not sell personal information based on the current codebase. We share information with service providers
              that help operate the product (for example transcription, AI generation, payment, storage, and email-delivery
              vendors), with integration providers you connect, and when required for legal/safety reasons.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">8. Third-Party Services</h2>
            <p>
              Current integrated providers include Supabase (database/auth/storage), Stripe (payments), AssemblyAI (primary
              transcription/diarization), OpenAI and Anthropic (AI generation/classification), Deepgram (fallback
              transcription path), Cloudflare R2 via S3-compatible APIs (audio object storage), Resend (support email
              delivery when configured), and optional Zoom/Microsoft integrations for recording imports.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">9. Payments</h2>
            <p>
              Payments are handled by Stripe Checkout. Stripe may process payment card and transaction details under its own
              terms and privacy policy. AudioRepurpose stores payment-related metadata needed for credits, invoices, and refund
              reconciliation, but does not store full card numbers in this codebase.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">10. Uploaded and User-Generated Content</h2>
            <p>
              Uploaded media and related transcript/speaker/content outputs are processed to provide service features. Audio
              files are stored in object storage and are configured to expire on a retention schedule (currently 7 days in the
              codebase). Other project data (for example transcripts and generated outputs) may remain until deleted by account
              actions or administrative lifecycle operations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">11. Data Retention</h2>
            <p>
              Retention depends on data type and feature. Examples in code include short-lived OAuth state cookies, audio
              object expiry workflows, and longer-lived account/project/billing records needed for product operation. We may
              retain some records as required for fraud prevention, reconciliation, and legal compliance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">12. Data Security</h2>
            <p>
              We use technical and organizational safeguards, including authenticated API access patterns and encrypted token
              storage for integration credentials. No system is perfectly secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">13. User Rights and Choices</h2>
            <p>
              You can update profile information in account settings, manage certain integration/settings preferences, and
              contact us to request access, correction, or other privacy actions that may apply under your local law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">14. Account and Data Deletion</h2>
            <p>
              The codebase includes an authenticated account deletion endpoint that removes or anonymizes multiple related data
              records and storage objects. If you need help, contact {PRIVACY_EMAIL}.
            </p>
            {/* TODO(legal): Confirm whether to add a dedicated in-product self-serve privacy request center beyond current account deletion endpoint. */}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">15. Email and Communications</h2>
            <p>
              The app sends operational communications such as account verification/password reset via authentication flows and
              may send support-related emails for submitted contact requests. We did not find a dedicated marketing email
              campaign system in this codebase.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">16. Children&apos;s Privacy</h2>
            <p>
              The service is intended for general business/creator use and is not designed specifically for children. If you
              believe a child provided personal information inappropriately, contact us so we can review and address it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">17. International Data Transfers</h2>
            <p>
              Because third-party infrastructure providers may process data in multiple regions, your information may be
              transferred to and processed in countries outside your own.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">18. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. The updated version will be posted on this page with a new
              &quot;Last updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">19. Contact Information</h2>
            <p>
              For privacy inquiries, contact us at {PRIVACY_EMAIL}.
            </p>
            {/* TODO(legal): If required, add [Company Legal Name] and [Business Address] once confirmed. */}
          </section>
        </div>
      </div>
    </div>
  );
}
