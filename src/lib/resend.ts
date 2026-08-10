import { Resend } from 'resend';
import { signSessionState } from '@/lib/sessionToken';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/types/firebase';

export const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');

// Check if Resend is actually configured with a real key
export const isResendConfigured =
  process.env.RESEND_API_KEY &&
  process.env.RESEND_API_KEY !== 're_placeholder';

/* ── Israeli Communications Law s.30א (spam) — one place, every marketing mail ──
 *
 * An advertising message must carry: the word "פרסומת" in the subject, the
 * advertiser's name and address in the body, and a simple way to opt out.
 * ₪1,000 statutory damages per message, no proof of harm needed. So both cron
 * senders go through composeMarketingEmail() below — there is no second path.
 *
 * The advertiser's identity is the owner's own data and is not in the codebase
 * yet — the same values are still placeholders on the terms page
 * (messages/he.json: s8_name_todo / s8_id_todo / s8_address_todo). Until they
 * are filled in, marketingBlockers() below refuses the send rather than putting
 * a placeholder string in front of a paying customer.
 *
 * TODO(owner): three values are needed before the first real send —
 *   1. the registered business name (ח.פ./ע.מ. holder), into ADVERTISER_NAME
 *   2. the physical postal address: street, number, city, into ADVERTISER_ADDRESS
 *   3. the same two into messages/he.json + messages/en.json (s8_name_todo,
 *      s8_id_todo, s8_address_todo) so the terms page stops showing placeholders
 * Also: hello@cinemind.co.il must have SPF + DKIM records on cinemind.co.il and
 * be verified in Resend, or everything lands in spam.
 */
export const MARKETING_SENDER = 'CineMind <hello@cinemind.co.il>';
export const ADVERTISER_NAME = 'CineMind';
export const ADVERTISER_ADDRESS = ''; // TODO(owner): real street, number, city — see above

/** Field on the user doc. Set by /api/unsubscribe, honoured by every cron sender. */
export const OPT_OUT_FIELD = 'marketingOptOut';

// The unsubscribe link must survive leaving our process, so it is built from the public
// origin, never from NEXT_PUBLIC_BASE_URL — that one has no production fallback (the
// checkout throws when it is unset) and is localhost in .env.local, which would put a
// dead link in every sent message. NEXT_PUBLIC_SITE_URL is what the rest of the app
// treats as canonical (layout.tsx, robots.ts, sitemap.ts), fallback included.
const PUBLIC_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://cinemind.co.il').replace(/\/+$/, '');

/**
 * Everything that would make an advertising message unlawful under s.30א, as a list
 * of English reasons for the log. Empty list = safe to send. Checked at the one place
 * that actually sends, so no caller can route around it.
 */
export function marketingBlockers(): string[] {
  const blockers: string[] = [];
  if (!ADVERTISER_NAME.trim()) {
    blockers.push('ADVERTISER_NAME is empty — the law requires the advertiser to be named');
  }
  if (!ADVERTISER_ADDRESS.trim()) {
    blockers.push('ADVERTISER_ADDRESS is empty — the law requires a physical address, and messages/he.json s8_address_todo is still a placeholder');
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(PUBLIC_ORIGIN)) {
    blockers.push(`unsubscribe links would point at ${PUBLIC_ORIGIN} — set NEXT_PUBLIC_SITE_URL to the public origin`);
  }
  return blockers;
}

/**
 * Signed, non-guessable opt-out link — no login needed. Same HMAC scheme as the
 * quiz session token (SESSION_SECRET), so there is one secret to rotate.
 */
export function unsubscribeUrl(uid: string): string {
  const token = signSessionState({ uid, k: 'mkt' });
  return `${PUBLIC_ORIGIN}/api/unsubscribe?t=${encodeURIComponent(token)}`;
}

function marketingFooterHtml(uid: string): string {
  return `
    <hr style="border:0;border-top:1px solid #ddd;margin:24px 0"/>
    <div style="font-size:12px;color:#888;line-height:1.6">
      <p style="margin:0 0 4px">מפרסם: ${ADVERTISER_NAME}, ${ADVERTISER_ADDRESS}</p>
      <p style="margin:0"><a href="${unsubscribeUrl(uid)}" style="color:#888">להסרה מרשימת התפוצה</a></p>
    </div>`;
}

export interface MarketingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  headers: Record<string, string>;
}

/**
 * Build a compliant advertising email. Pure — no network, so it can be read back
 * in a test without an API key.
 */
export function composeMarketingEmail(opts: {
  to: string; uid: string; subject: string; html: string;
}): MarketingEmail {
  return {
    from: MARKETING_SENDER,
    to: opts.to,
    subject: `פרסומת: ${opts.subject}`,
    html: opts.html + marketingFooterHtml(opts.uid),
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl(opts.uid)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

/**
 * Sends unless there is no API key (then it is a dry run). Returns what was composed.
 * Throws before composing anything if the message could not be lawful — a send that
 * cannot be lawful must fail loudly, not go out with a placeholder in the footer.
 */
export async function sendMarketingEmail(opts: {
  to: string; uid: string; subject: string; html: string;
}): Promise<MarketingEmail> {
  const blockers = marketingBlockers();
  if (blockers.length) {
    console.error(
      '[EMAIL BLOCKED] refusing to send an advertising message — Communications Law s.30א:\n  - ' +
      blockers.join('\n  - ')
    );
    throw new Error(`Marketing email blocked: ${blockers.join('; ')}`);
  }
  const msg = composeMarketingEmail(opts);
  if (isResendConfigured) await resend.emails.send(msg);
  // No API key = dry run. Log what would have gone out, so the compliance bits
  // (subject prefix, advertiser block, unsubscribe link) are checkable without sending.
  else console.log('[EMAIL DRY RUN]', JSON.stringify(msg, null, 2));
  return msg;
}

export function isOptedOut(userData: Record<string, unknown> | undefined): boolean {
  return userData?.[OPT_OUT_FIELD] === true;
}

/**
 * Look up a recipient by email. Returns null when there is no user doc — we
 * cannot give that address a working opt-out link, so we must not advertise to it.
 */
export async function findMarketingRecipient(
  email: string
): Promise<{ uid: string; optOut: boolean } | null> {
  const snap = await adminDb.collection(COLLECTIONS.users).where('email', '==', email).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, optOut: isOptedOut(doc.data()) };
}
