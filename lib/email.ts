import "server-only";
import { createHash } from "node:crypto";

/**
 * Sends one plain email through Resend. Without RESEND_API_KEY and EMAIL_FROM (an address on a
 * domain verified in Resend) nothing is sent and the caller says so plainly. Every caller rate-limits
 * and logs to app_emails; the recipient is stored only as a hash.
 */
export type EmailResult = { status: "sent" | "failed" | "not_configured"; id?: string };

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail(m: { to: string; subject: string; text: string; replyTo?: string; fromName?: string }): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { status: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: m.fromName ? `${m.fromName.replace(/[<>"\r\n]/g, "").slice(0, 60)} via Prod AI <${from}>` : from,
        to: [m.to],
        subject: m.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
        text: m.text.slice(0, 10_000),
        ...(m.replyTo ? { reply_to: m.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("[email] send failed", res.status, (await res.text()).slice(0, 200));
      return { status: "failed" };
    }
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return { status: "sent", id: j.id };
  } catch (e) {
    console.error("[email] send failed", e instanceof Error ? e.message : e);
    return { status: "failed" };
  }
}

export const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i;

/** Emails are stored only as a hash (to count and audit, never to read). */
export const hashEmail = (email: string) => createHash("sha256").update(`${process.env.RATE_LIMIT_SALT ?? "prodai"}:${email.trim().toLowerCase()}`).digest("hex").slice(0, 32);
