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
};

export const config: Config = {
  // Thursdays at 17:00 UTC (was vercel.json "0 17 * * 4").
  schedule: "0 17 * * 4",
};
