# Supabase Email Templates

Use these templates in Supabase Dashboard -> Authentication -> Email Templates.

These templates rely on Supabase Auth variables:

- `{{ .ConfirmationURL }}` for confirmation, reset, invite, magic link, and email change links.
- `{{ .Token }}` for one-time codes such as reauthentication.
- `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .OldEmail }}`, `{{ .Provider }}`, and `{{ .FactorType }}` for account/security notifications.

Recommended sender:

- From name: `AudioRepurpose`
- From email: `support@audiorepurpose.com`
- Reply-to: `support@audiorepurpose.com`

Recommended redirect allow list:

- `https://audiorepurpose.com/auth/callback`
- `https://audiorepurpose.com/auth/update-password`
- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/update-password`

If the email provider supports click/open tracking, disable link tracking for Supabase auth mail. Supabase auth links are one-time sensitive links, and link rewriting can break verification.

## Custom SMTP Setup

Supabase's built-in email service is only for testing. It is rate-limited, can refuse delivery to non-team addresses, and is not meant for production auth flows. Configure custom SMTP before launch.

Because this app already uses Resend for contact email delivery, the simplest production setup is Resend SMTP.

### Resend

1. In Resend, verify the sending domain, such as `audiorepurpose.com` or a dedicated auth subdomain.
2. Add the DNS records Resend provides for SPF/DKIM/domain verification.
3. Create a Resend API key.
4. In Supabase Dashboard, go to Authentication -> Emails -> SMTP Settings.
5. Enable custom SMTP and use:

```text
Sender email: support@audiorepurpose.com
Sender name: AudioRepurpose
SMTP host: smtp.resend.com
SMTP port: 465
SMTP username: resend
SMTP password: <Resend API key>
```

6. Save the settings and send a test email from Supabase.
7. Test the real app flows:

- Sign up with a fresh email address and confirm the account.
- Request a password reset from `/auth/reset-password`.
- Change the account email from settings if that flow is enabled.

### Other SMTP Providers

Supabase also supports SMTP credentials from providers such as Postmark, AWS SES, SendGrid, ZeptoMail, and Brevo. Use the same Supabase screen with the provider's SMTP host, port, username, and password.

Typical production values:

```text
Sender email: support@audiorepurpose.com
Sender name: AudioRepurpose
SMTP host: <provider SMTP host>
SMTP port: 465 or 587
SMTP username: <provider SMTP username>
SMTP password: <provider SMTP password>
```

After custom SMTP is active, review Authentication -> Rate Limits. Supabase applies a low initial auth email limit with custom SMTP, and production launches may need a higher limit.

## Confirm Signup

Subject:

```text
Confirm your AudioRepurpose account
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">Confirm your email</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        Welcome to AudioRepurpose. Confirm your email address to finish setting up your account and start turning recordings into transcripts, insights, and publish-ready content.
      </p>
      <p style="margin:24px 0;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 18px;border-radius:8px;">
          Confirm email
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#64748b;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="margin:0 0 20px;font-size:13px;line-height:1.6;word-break:break-all;color:#2563eb;">
        {{ .ConfirmationURL }}
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you did not create an AudioRepurpose account, you can ignore this email.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## Reset Password

Subject:

```text
Reset your AudioRepurpose password
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">Reset your password</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        We received a request to reset the password for your AudioRepurpose account. Use the secure link below to choose a new password.
      </p>
      <p style="margin:24px 0;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 18px;border-radius:8px;">
          Reset password
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#64748b;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="margin:0 0 20px;font-size:13px;line-height:1.6;word-break:break-all;color:#2563eb;">
        {{ .ConfirmationURL }}
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you did not request this reset, no action is needed. Your password will stay the same.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## Magic Link

Use this only if passwordless email login is enabled.

Subject:

```text
Sign in to AudioRepurpose
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">Sign in to AudioRepurpose</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        Use this secure one-time link to sign in to your AudioRepurpose account.
      </p>
      <p style="margin:24px 0;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 18px;border-radius:8px;">
          Sign in
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#64748b;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="margin:0 0 20px;font-size:13px;line-height:1.6;word-break:break-all;color:#2563eb;">
        {{ .ConfirmationURL }}
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you did not request this sign-in link, you can ignore this email.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## Invite User

Use this if team/user invites are added later.

Subject:

```text
You have been invited to AudioRepurpose
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">You have been invited</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        You have been invited to join AudioRepurpose. Accept the invitation to create your account and access the workspace.
      </p>
      <p style="margin:24px 0;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 18px;border-radius:8px;">
          Accept invitation
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#64748b;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="margin:0 0 20px;font-size:13px;line-height:1.6;word-break:break-all;color:#2563eb;">
        {{ .ConfirmationURL }}
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you were not expecting this invitation, you can ignore this email.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## Confirm Email Change

Subject:

```text
Confirm your new AudioRepurpose email
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">Confirm your new email</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        Confirm that you want to use <strong>{{ .NewEmail }}</strong> as the email address for your AudioRepurpose account.
      </p>
      <p style="margin:24px 0;">
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 18px;border-radius:8px;">
          Confirm new email
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#64748b;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="margin:0 0 20px;font-size:13px;line-height:1.6;word-break:break-all;color:#2563eb;">
        {{ .ConfirmationURL }}
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you did not request this change, contact support@audiorepurpose.com.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## Reauthentication

Subject:

```text
Your AudioRepurpose verification code
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">Verification code</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        Use this code to continue with your AudioRepurpose account action.
      </p>
      <p style="margin:20px 0;padding:16px 18px;background:#f1f5f9;border-radius:8px;text-align:center;font-size:28px;line-height:1;letter-spacing:4px;font-weight:700;color:#0f172a;">
        {{ .Token }}
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you did not request this code, contact support@audiorepurpose.com.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## Password Changed Notification

Enable this security notification.

Subject:

```text
Your AudioRepurpose password was changed
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">Your password was changed</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        This is a confirmation that the password for <strong>{{ .Email }}</strong> was changed.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you made this change, no action is needed. If you did not, reset your password immediately and contact support@audiorepurpose.com.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## Email Changed Notification

Enable this security notification.

Subject:

```text
Your AudioRepurpose email was changed
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">Your email was changed</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        The email address for your AudioRepurpose account was changed from <strong>{{ .OldEmail }}</strong> to <strong>{{ .Email }}</strong>.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you made this change, no action is needed. If you did not, contact support@audiorepurpose.com immediately.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## Identity Linked Notification

Enable this security notification if OAuth account linking is available.

Subject:

```text
A sign-in method was added to AudioRepurpose
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">A sign-in method was added</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        A <strong>{{ .Provider }}</strong> identity was linked to your AudioRepurpose account, <strong>{{ .Email }}</strong>.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you made this change, no action is needed. If you did not, contact support@audiorepurpose.com immediately.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## Identity Unlinked Notification

Enable this security notification if OAuth account linking is available.

Subject:

```text
A sign-in method was removed from AudioRepurpose
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">A sign-in method was removed</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        A <strong>{{ .Provider }}</strong> identity was unlinked from your AudioRepurpose account, <strong>{{ .Email }}</strong>.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you made this change, no action is needed. If you did not, contact support@audiorepurpose.com immediately.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## MFA Factor Added Notification

Enable this security notification if MFA is enabled.

Subject:

```text
An MFA method was added to AudioRepurpose
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">An MFA method was added</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        A new <strong>{{ .FactorType }}</strong> MFA method was added to your AudioRepurpose account, <strong>{{ .Email }}</strong>.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you made this change, no action is needed. If you did not, contact support@audiorepurpose.com immediately.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## MFA Factor Removed Notification

Enable this security notification if MFA is enabled.

Subject:

```text
An MFA method was removed from AudioRepurpose
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">An MFA method was removed</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        A <strong>{{ .FactorType }}</strong> MFA method was removed from your AudioRepurpose account, <strong>{{ .Email }}</strong>.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you made this change, no action is needed. If you did not, contact support@audiorepurpose.com immediately.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## Phone Changed Notification

Only enable this if phone auth is enabled.

Subject:

```text
Your AudioRepurpose phone number was changed
```

HTML body:

```html
<div style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">Your phone number was changed</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
        The phone number for your AudioRepurpose account, <strong>{{ .Email }}</strong>, was changed from <strong>{{ .OldPhone }}</strong> to <strong>{{ .Phone }}</strong>.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
        If you made this change, no action is needed. If you did not, contact support@audiorepurpose.com immediately.
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;color:#94a3b8;">
      AudioRepurpose - support@audiorepurpose.com
    </p>
  </div>
</div>
```

## References

- Supabase Email Templates: https://supabase.com/docs/guides/auth/auth-email-templates
- Supabase Custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase Auth rate limits: https://supabase.com/docs/guides/auth/rate-limits
- Resend Supabase SMTP: https://resend.com/docs/send-with-supabase-smtp
- Supabase local template configuration: https://supabase.com/docs/guides/local-development/customizing-email-templates
