export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-50 mb-6">Privacy Policy</h1>
        <p className="text-sm text-slate-400 mb-8">Effective date: {new Date().toLocaleDateString()}</p>

        <div className="space-y-6 text-sm leading-relaxed text-slate-300">
          <section>
            <h2 className="text-lg font-semibold text-slate-50 mb-2">1. What We Collect</h2>
            <p>
              We collect account information (email, name), uploaded media, transcripts, generated content, and usage data
              needed to provide the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-50 mb-2">2. How We Use Data</h2>
            <p>
              We use your data to process uploads, generate transcripts and content, provide support, and improve the
              service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-50 mb-2">3. AI Providers</h2>
            <p>
              We use third‑party AI providers (including OpenAI) to process audio, transcripts, and related metadata. If you
              opt in, we may share data with OpenAI to receive free token benefits. You can opt out any time in Settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-50 mb-2">4. Data Sharing</h2>
            <p>
              We do not sell your personal information. We share data only with vendors necessary to provide the service
              (e.g., AI, storage, payments) and as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-50 mb-2">5. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active or as needed to provide the service. You can request
              deletion of your account data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-50 mb-2">6. Your Rights</h2>
            <p>
              Canada: You have rights under PIPEDA to access and correct your personal information. United States: rights may
              vary by state (e.g., California). Contact us to exercise your rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-50 mb-2">7. Security</h2>
            <p>
              We use reasonable safeguards to protect data but cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-50 mb-2">8. Contact</h2>
            <p>
              For privacy inquiries, contact us at privacy@audiorepurpose.com.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
