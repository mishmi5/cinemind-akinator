import type { Config } from "@netlify/functions";

// Replaces the Vercel cron entry for /api/cron/weekly-newsletter.
export default async () => {
  const base = Netlify.env.get("URL") ?? Netlify.env.get("NEXT_PUBLIC_BASE_URL");
  const secret = Netlify.env.get("CRON_SECRET");

  if (!base) {
    console.error("[cron weekly-newsletter] No site URL available (URL / NEXT_PUBLIC_BASE_URL)");
    return;
  }

  const res = await fetch(`${base}/api/cron/weekly-newsletter`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
  console.log(`[cron weekly-newsletter] ${res.status} ${res.statusText}`);
  // The route answers 503 with the reasons when the mail could not be lawful (missing advertiser
  // details, an unsubscribe link pointing at localhost). Without the body, that arrives here as a
  // bare 503 and the reason never reaches whoever reads the function log.
  if (!res.ok) console.error(`[cron weekly-newsletter] ${await res.text()}`);
};

export const config: Config = {
  // Thursdays at 17:00 UTC (was vercel.json "0 17 * * 4").
  schedule: "0 17 * * 4",
};
