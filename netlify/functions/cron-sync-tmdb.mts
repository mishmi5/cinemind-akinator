import type { Config } from "@netlify/functions";

// Scheduled trigger that invokes the existing Next.js cron route, passing the
// CRON_SECRET bearer the route already checks. Replaces the Vercel cron entry
// for /api/cron/sync-tmdb. Vercel injected the bearer automatically; on Netlify
// we attach it explicitly here.
export default async () => {
  const base = Netlify.env.get("URL") ?? Netlify.env.get("NEXT_PUBLIC_BASE_URL");
  const secret = Netlify.env.get("CRON_SECRET");

  if (!base) {
    console.error("[cron sync-tmdb] No site URL available (URL / NEXT_PUBLIC_BASE_URL)");
    return;
  }

  const res = await fetch(`${base}/api/cron/sync-tmdb`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
  console.log(`[cron sync-tmdb] ${res.status} ${res.statusText}`);
};

export const config: Config = {
  // Daily at 03:00 UTC (was vercel.json "0 3 * * *").
  schedule: "0 3 * * *",
};
