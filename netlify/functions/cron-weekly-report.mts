import type { Config } from "@netlify/functions";

// Replaces the Vercel cron entry for /api/cron/weekly-report.
export default async () => {
  const base = Netlify.env.get("URL") ?? Netlify.env.get("NEXT_PUBLIC_BASE_URL");
  const secret = Netlify.env.get("CRON_SECRET");

  if (!base) {
    console.error("[cron weekly-report] No site URL available (URL / NEXT_PUBLIC_BASE_URL)");
    return;
  }

  const res = await fetch(`${base}/api/cron/weekly-report`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
  console.log(`[cron weekly-report] ${res.status} ${res.statusText}`);
};

export const config: Config = {
  // Sundays at 08:00 UTC (was vercel.json "0 8 * * 0").
  schedule: "0 8 * * 0",
};
