import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cronAuth';
import { isResendConfigured, sendMarketingEmail, isOptedOut, marketingBlockers } from '@/lib/resend';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, UserDoc } from '@/types/firebase';
import { recommendBySubGenre, getWatchProviders, getTrailer } from '@/lib/brain/tmdb';
import { FieldValue } from 'firebase-admin/firestore';

// The weekly pick — the thing a subscription actually buys. This used to send a hardcoded
// "סרט 1 / סרט 2 / סרט 3" to a single mock address. It now reads the taste profile the quiz
// saved and sends ONE headline film (a list is the scrolling problem this product exists to
// end), with why-it-fits-you and where to watch it in Israel.
//
// Churn rules encoded here, from the value analysis:
//  • never repeat a film the user was already sent (weeklySeen)
//  • never send something with no Israeli availability — an unwatchable pick kills trust
//  • one film, not a list
export const maxDuration = 60;

// The sender prefixes "פרסומת:" (Communications Law s.30א), so no colon here.
const HE_SUBJECT = (term: string) => `הסרט שלך לסופ״ש — ${term} 🍿`;

function emailHtml(opts: {
  name: string; title: string; year?: string; reason: string;
  poster?: string; trailerId?: string;
  stream: string[]; rent: string[];
}) {
  const { name, title, year, reason, poster, trailerId, stream, rent } = opts;
  const where = stream.length
    ? `<p style="margin:8px 0"><strong>כלול אצלך במנוי:</strong> ${stream.join(' · ')}</p>`
    : rent.length
      ? `<p style="margin:8px 0"><strong>להשכרה:</strong> ${rent.join(' · ')}</p>`
      : '';
  return `
  <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px">
    <p>היי ${name},</p>
    <p style="margin:0 0 16px">הנה הסרט לערב — אחד, לא רשימה.</p>
    ${poster ? `<img src="${poster}" alt="" width="180" style="border-radius:12px;display:block;margin-bottom:12px"/>` : ''}
    <h2 style="margin:0 0 4px">${title}${year ? ` (${year})` : ''}</h2>
    <p style="margin:0 0 12px;color:#444">${reason}</p>
    ${where}
    ${trailerId ? `<p style="margin:12px 0"><a href="https://www.youtube.com/watch?v=${trailerId}">▶ לצפייה בטריילר</a></p>` : ''}
    <p style="margin-top:24px;font-size:12px;color:#888">לא בקטע? דרג אותו אצלנו והשבוע הבא יהיה מדויק יותר.</p>
  </div>`;
}

export async function GET(request: Request) {
  try {
    if (!cronAuthorized(request)) {
      return new Response('Unauthorized', { status: 401 });
    }

    // sendMarketingEmail() refuses per message anyway, but that refusal would land inside the
    // per-user catch below after a few hundred TMDB lookups. Fail once, up front, and say why.
    const blockers = marketingBlockers();
    if (blockers.length) {
      console.error('[CRON] weekly newsletter aborted — the message cannot be lawful:\n  - ' + blockers.join('\n  - '));
      return NextResponse.json({ error: 'Marketing email not compliant', blockers }, { status: 503 });
    }

    // Only users who actually finished a quiz have a taste to send against.
    const snap = await adminDb.collection(COLLECTIONS.users).limit(500).get();
    let sent = 0, skippedNoTaste = 0, skippedNoPick = 0, skippedOptOut = 0;

    for (const doc of snap.docs) {
      const data = doc.data() as UserDoc & { email?: string; weeklySeen?: string[] };
      // Anyone who used the unsubscribe link never gets another one of these.
      if (isOptedOut(doc.data())) { skippedOptOut++; continue; }
      const email = data.email;
      const affinities: Record<string, number> =
        (data.tasteVector as unknown as { affinities?: Record<string, number> })?.affinities || {};
      const loved = Object.entries(affinities).filter(([, v]) => v >= 0.4).sort((a, b) => b[1] - a[1]);
      if (!email || !loved.length) { skippedNoTaste++; continue; }

      const alreadySent = data.weeklySeen || [];
      type Pick = Awaited<ReturnType<typeof recommendBySubGenre>>[number];
      let pick: Pick | undefined;
      let pickTerm = '';
      let watch: Awaited<ReturnType<typeof getWatchProviders>> = null;
      // Walk the loved sub-genres strongest-first until we find something they have not been
      // sent AND can actually watch tonight.
      for (const [term] of loved.slice(0, 3)) {
        const candidates = await recommendBySubGenre(term, alreadySent, 'he', 6);
        for (const c of candidates) {
          const w = await getWatchProviders(c.id, 'IL');
          if (w && (w.stream.length || w.rent.length)) { pick = c; pickTerm = term; watch = w; break; }
        }
        if (pick) break;
      }
      if (!pick) { skippedNoPick++; continue; }

      const html = emailHtml({
        name: data.displayName || 'שלום',
        title: pick.title,
        year: (pick.originalDetails || '').match(/(\d{4})/)?.[1],
        reason: `כי אתה אוהב ${pickTerm} — וזה בדיוק הסגנון הזה.`,
        poster: pick.posterUrl?.startsWith('http') ? pick.posterUrl : undefined,
        trailerId: await getTrailer(pick.id),
        stream: (watch?.stream || []).map(p => p.name),
        rent: (watch?.rent || []).map(p => p.name).slice(0, 2),
      });

      try {
        // Adds the "פרסומת:" prefix, the advertiser block, the unsubscribe link
        // and the List-Unsubscribe header. Dry-run when there is no API key.
        await sendMarketingEmail({ to: email, uid: doc.id, subject: HE_SUBJECT(pickTerm), html });
        // Remember it even in dry-run so a later real send does not repeat the same film.
        await doc.ref.update({ weeklySeen: FieldValue.arrayUnion(pick.id) });
        sent++;
      } catch (err) {
        console.error('[CRON] send failed for', doc.id, err);
      }
    }

    console.log(`[CRON] weekly: sent=${sent} noTaste=${skippedNoTaste} noWatchablePick=${skippedNoPick} optOut=${skippedOptOut}`);
    return NextResponse.json({ success: true, sent, skippedNoTaste, skippedNoPick, skippedOptOut, dryRun: !isResendConfigured });
  } catch (error: unknown) {
    console.error('[CRON Newsletter Error]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
