/**
 * Email delivery through Brevo's HTTPS API (Render's free tier blocks SMTP ports).
 * When BREVO_API_KEY is not configured, emails are printed to the server log instead,
 * so the whole app still works locally.
 */
import { config, features } from '../config';

export interface MailInput {
  to: string;
  toName?: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  code?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function renderEmail(m: MailInput): { html: string; text: string } {
  const p = m.paragraphs.map((t) => `<p style="margin:0 0 14px;color:#cbd2e1;font-size:15px;line-height:1.6">${escapeHtml(t)}</p>`).join('');
  const code = m.code
    ? `<div style="margin:18px 0;padding:16px;border-radius:12px;background:#151a2e;border:1px solid #2a3150;text-align:center;font:600 30px/1 'Courier New',monospace;letter-spacing:10px;color:#ffffff">${escapeHtml(m.code)}</div>`
    : '';
  const cta = m.cta
    ? `<a href="${escapeHtml(m.cta.url)}" style="display:inline-block;margin-top:6px;padding:12px 22px;border-radius:10px;background:#7c6cff;color:#ffffff;font-weight:600;text-decoration:none">${escapeHtml(m.cta.label)}</a>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#0b0e1a;font-family:Inter,Segoe UI,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="font-weight:700;font-size:18px;color:#ffffff;margin-bottom:22px">Partner<span style="color:#2dd4bf"> in </span>Project</div>
<div style="background:#11152a;border:1px solid #232a45;border-radius:16px;padding:28px">
<h1 style="margin:0 0 16px;font-size:21px;color:#ffffff">${escapeHtml(m.heading)}</h1>${p}${code}${cta}</div>
<p style="color:#6b7393;font-size:12px;margin-top:18px">You received this because of activity on your Partner in Project account. You can turn off email notifications in Settings.</p>
</div></body></html>`;
  const text = [m.heading, '', ...m.paragraphs, m.code ? `Code: ${m.code}` : '', m.cta ? `${m.cta.label}: ${m.cta.url}` : '']
    .filter((l) => l !== undefined)
    .join('\n');
  return { html, text };
}

export async function sendEmail(m: MailInput): Promise<boolean> {
  const { html, text } = renderEmail(m);
  if (!features.email) {
    if (!config.isTest) {
      console.log(`[email:dev] to=${m.to} subject="${m.subject}"\n${text}\n`);
    }
    return false;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.email.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: config.email.from, name: config.email.fromName },
        to: [{ email: m.to, name: m.toName || undefined }],
        subject: m.subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error('[email] Brevo error', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] send failed', e);
    return false;
  }
}
