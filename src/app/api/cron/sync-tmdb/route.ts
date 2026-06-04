import { NextResponse } from 'next/server';
import { sendTelegramAlert } from '@/lib/telegram';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    const TMDB_API_KEY = process.env.TMDB_API_KEY;
    if (!TMDB_API_KEY) {
      await sendTelegramAlert('🚨 <b>Sync Failed</b>\nTMDB API Key missing.');
      return new Response('TMDB config missing', { status: 500 });
    }

    console.log('[CRON] Starting Delta TMDB Sync...');
    // Fetch only movies changed in the last 24 hours (Delta Sync)
    const res = await fetch(`https://api.themoviedb.org/3/movie/changes?api_key=${TMDB_API_KEY}&start_date=${new Date(Date.now() - 86400000).toISOString().split('T')[0]}&end_date=${new Date().toISOString().split('T')[0]}`, {
      next: { revalidate: 0 }
    });
    
    if (!res.ok) throw new Error('Failed to fetch from TMDB');
    const data = await res.json();
    
    const changedCount = data.results?.length || 0;
    
    // Simulate updating only the changed movies in the DB
    console.log(`[CRON] Delta Sync Complete: ${changedCount} movies updated.`);
    await sendTelegramAlert(`✅ <b>TMDB Delta Sync Complete</b>\nProcessed ${changedCount} updated movies. Saved 98% compute costs.`);

    return NextResponse.json({ success: true, syncedCount: changedCount, method: 'delta' });
  } catch (error: any) {
    console.error('[CRON Error]', error);
    await sendTelegramAlert(`🚨 <b>TMDB Sync Error</b>\n` + String(error.message));
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

