import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/**
 * One-time sign-in codes are delivered through Resend.
 *
 * Configuration lives in Convex environment variables (set them from the
 * dashboard, not in this file):
 *   RESEND_API_KEY     — API key from resend.com
 *   RESEND_EMAIL_FROM  — verified sender, e.g. "AccsMartHub <no-reply@yourdomain.com>"
 *
 * When the key is missing we fail loudly rather than silently pretending a
 * code was sent — otherwise a misconfigured deploy looks like "email is broken".
 */
const APP_NAME = "AccsMartHub";

async function sendOtpEmail(to: string, token: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error(
      "Email delivery is not configured. Set RESEND_API_KEY and RESEND_EMAIL_FROM in your Convex environment variables.",
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `${token} is your ${APP_NAME} sign-in code`,
      html: `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#15172b">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
      <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:-0.02em">${APP_NAME}</p>
      <p style="margin:24px 0 8px;font-size:14px;color:#6b7280">Your sign-in code is</p>
      <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:0.24em">${token}</p>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#4b5563">
        This code expires in 15 minutes. Use it once to sign in — we will never
        ask you for it by phone, chat or email reply.
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">
        If you did not try to sign in, you can safely ignore this email.
      </p>
    </div>
  </body>
</html>`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email provider rejected the request (${response.status}): ${detail}`);
  }
}

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    await sendOtpEmail(email, token);
  },
});
