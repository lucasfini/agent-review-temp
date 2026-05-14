import { PRIVACY_EMAIL } from '@/lib/site-config';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-slate-700 dark:bg-slate-950 dark:text-slate-200">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:px-6 sm:py-12">
        <h1 className="mb-6 text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">Privacy Policy</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Last updated: May 13, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">1. Overview</h2>
            <p>
              AudioRepurpose helps users upload audio or video and generate transcripts, speaker analysis, summaries, and
              repurposed content outputs. This Privacy Policy explains what information we collect, how we use it, and your
              choices.
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
              temporary OAuth state for Zoom/Microsoft/YouTube connection flows, and signup consent capture). The app also uses
              browser storage such as localStorage/IndexedDB for upload queue continuity. We do not use advertising cookies or
              third-party marketing pixels for targeted advertising.
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
              We do not sell personal information. We share information with service providers
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
              delivery when configured), and optional Zoom/Microsoft/YouTube integrations for recording imports.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">9. YouTube API Services Disclosure</h2>
            <p>
              AudioRepurpose uses YouTube API Services for YouTube-connected features (for example, listing your uploads and
              importing supported videos). If you choose to connect YouTube, you also agree to the{' '}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-slate-400 underline-offset-2 hover:text-slate-900 dark:hover:text-slate-100"
              >
                YouTube Terms of Service
              </a>
              . Google&apos;s handling of data is described in the{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-slate-400 underline-offset-2 hover:text-slate-900 dark:hover:text-slate-100"
              >
                Google Privacy Policy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">10. Payments</h2>
            <p>
              Payments are handled by Stripe Checkout. Stripe may process payment card and transaction details under its own
              terms and privacy policy. AudioRepurpose stores payment-related metadata needed for credits, invoices, and refund
              reconciliation, but does not store full payment card numbers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">11. Uploaded and User-Generated Content</h2>
            <p>
              Uploaded media and related transcript/speaker/content outputs are processed to provide service features. Audio
              files are stored in object storage and are configured to expire on a retention schedule (currently 7 days). Other
              project data (for example transcripts and generated outputs) may remain until deleted by account
              actions or administrative lifecycle operations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">12. Data Retention</h2>
            <p>
              Retention depends on data type and feature. Examples in code include short-lived OAuth state cookies, audio
              object expiry workflows, and longer-lived account/project/billing records needed for product operation. We may
              retain some records as required for fraud prevention, reconciliation, and legal compliance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">13. Data Security</h2>
            <p>
              We use technical and organizational safeguards, including authenticated API access patterns and encrypted token
              storage for integration credentials. No system is perfectly secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">14. User Rights and Choices</h2>
            <p>
              You can update profile information in account settings, manage certain integration/settings preferences, and
              contact us to request access, correction, or other privacy actions that may apply under your local law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">15. Connected Accounts, Revocation, and Deletion</h2>
            <p>
              You can disconnect connected integrations (including YouTube) from account settings. You can also remove
              AudioRepurpose access at any time from your Google security permissions page. We also provide an authenticated
              account deletion flow that removes or anonymizes multiple related data records and storage
              objects. If you need help, contact {PRIVACY_EMAIL}.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">16. Email and Communications</h2>
            <p>
              The app sends operational communications such as account verification/password reset via authentication flows and
              may send support-related emails for submitted contact requests. We do not send marketing email campaigns unless
              you explicitly opt in where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">17. Children&apos;s Privacy</h2>
            <p>
              The service is intended for general business/creator use and is not designed specifically for children. If you
              believe a child provided personal information inappropriately, contact us so we can review and address it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">18. International Data Transfers</h2>
            <p>
              Because third-party infrastructure providers may process data in multiple regions, your information may be
              transferred to and processed in countries outside your own.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">19. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. The updated version will be posted on this page with a new
              &quot;Last updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-2">20. Contact Information</h2>
            <p>
              For privacy inquiries, contact us at {PRIVACY_EMAIL}.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
