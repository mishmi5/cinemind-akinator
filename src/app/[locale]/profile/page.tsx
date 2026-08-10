'use client';

import React, { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import Navbar from '@/components/Navbar';
import SkipLink from '@/components/SkipLink';
import { useAuth } from '@/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase';

// The value stored on the profile stays stable in English; only what the user reads is translated.
// A Hebrew visitor was picking their own title from a list written entirely in Latin script.
const TITLES = ["Master of Horror", "Space Explorer", "Action Hero", "Comedy Genius", "Drama Queen", "Cinematic Architect"];
const TITLE_HE: Record<string, string> = {
  "Master of Horror": "אלוף האימה",
  "Space Explorer": "חוקר החלל",
  "Action Hero": "גיבור אקשן",
  "Comedy Genius": "גאון הקומדיה",
  "Drama Queen": "מלכת הדרמה",
  "Cinematic Architect": "אדריכל קולנועי",
};
const COLORS = [
  { id: 'indigo', name: 'Cyber Blue', hex: '#6366f1', glow: 'rgba(99,102,241,0.4)', bg: 'bg-indigo-500' },
  { id: 'rose', name: 'Neon Red', hex: '#f43f5e', glow: 'rgba(244,63,94,0.4)', bg: 'bg-rose-500' },
  { id: 'emerald', name: 'Matrix Green', hex: '#10b981', glow: 'rgba(16,185,129,0.4)', bg: 'bg-emerald-500' },
  { id: 'amber', name: 'Golden Star', hex: '#f59e0b', glow: 'rgba(245,158,11,0.4)', bg: 'bg-amber-500' }
];

export default function UserProfile() {
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [title, setTitle] = useState(TITLES[0]);
  const [accent, setAccent] = useState(COLORS[0]);
  
  const locale = useLocale();
  const dir = locale === 'he' ? 'rtl' : 'ltr';
  const { user: authUser, loading } = useAuth();
  const [xp, setXp] = useState(0);

  // Avatar art only — it used to sit inside a fake "user" object that also carried an
  // invented name, plan and token balance, shown identically to every visitor.
  const avatarSeed = authUser?.uid || 'guest';
  const avatars = ['avataaars', 'bottts', 'micah', 'adventurer'].map(
    (style) => `https://api.dicebear.com/7.x/${style}/svg?seed=${avatarSeed}&backgroundColor=${accent.hex.replace('#','')}`
  );

  useEffect(() => {
    const savedXp = localStorage.getItem('cinemind_xp');
    if (savedXp) setXp(parseInt(savedXp, 10));
  }, []);

  // The REAL taste profile the quiz saved. This screen is what a subscriber is paying to keep,
  // so it must show what the engine actually knows — it used to render three invented genres
  // identical for every visitor.
  const [taste, setTaste] = useState<{
    hasProfile: boolean;
    isPremium?: boolean;
    loved: { term: string; score: number }[];
    rejected: { term: string; score: number }[];
    totalTerms?: number;
    economy?: { xp?: number; streak?: number } | null;
  } | null>(null);
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await authUser.getIdToken();
        const res = await fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok && !cancelled) {
          const body = await res.json();
          setTaste(body);
          // The server is the one that awards XP, so it is the one that knows the total. This page
          // used to read localStorage only, which meant a user the server had paid 100 XP was shown 0.
          if (typeof body?.economy?.xp === 'number') setXp(body.economy.xp);
        }
      } catch { /* leave the empty state — never block the page on this */ }
    })();
    return () => { cancelled = true; };
  }, [authUser]);

  const currentAvatar = avatars[avatarIndex];

  if (loading) {
    return (
      <div dir={dir} className="min-h-screen bg-[#070709] text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div dir={dir} className="min-h-screen bg-[#070709] text-white font-sans overflow-x-hidden pb-20">
      <SkipLink />
      <Navbar />

      <div id="main-content" className="max-w-4xl mx-auto px-4 mt-12">
        {/* Header Profile */}
        <div className="bg-[#111113] border border-white/5 rounded-[2rem] p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden shadow-2xl mb-8 transition-all duration-500" style={{ boxShadow: `0 20px 40px -10px ${accent.glow}` }}>
          <div className="absolute top-0 right-0 w-64 h-64 blur-[100px] pointer-events-none transition-colors duration-500" style={{ backgroundColor: accent.glow }}></div>
          
          <div className="w-32 h-32 rounded-full border-4 p-1 relative bg-zinc-900 transition-colors duration-500" style={{ borderColor: accent.hex, boxShadow: `0 0 30px ${accent.glow}` }}>
            {/* Decorative: the avatar art carries no information the name beside it does not. */}
            <img src={currentAvatar} alt="" className="w-full h-full rounded-full transition-all duration-500" />
            <button
              onClick={() => setAvatarIndex((prev) => (prev + 1) % avatars.length)}
              aria-label={locale === 'he' ? 'החלפת האווטאר' : 'Change avatar'}
              className="absolute bottom-0 end-0 w-11 h-11 bg-white text-black rounded-full flex items-center justify-center font-bold shadow-lg hover:scale-110 transition-transform"
            >
              <span aria-hidden="true">↻</span>
            </button>
          </div>

          <div className="flex-1 text-center md:text-right z-10">
            <h1 className="text-4xl font-black mb-1">{authUser?.displayName || authUser?.email?.split('@')[0] || (taste?.hasProfile ? 'הפרופיל שלך' : 'אורח')}</h1>
            <div className="text-xl font-bold mb-3 transition-colors duration-500" style={{ color: accent.hex }}>{locale === 'he' ? (TITLE_HE[title] || title) : title}</div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-sm font-bold mb-2">
              👑 {taste?.isPremium ? 'מקום מייסד' : 'חשבון חינם'}
            </div>
            <div className="text-xs text-zinc-400 mb-4 font-mono">
              {!isFirebaseConfigured ? "אורח זמני" : 
                (authUser?.isAnonymous ? "אורח זמני" : authUser?.email)}
            </div>
            <p className="text-zinc-400 text-sm max-w-md">
              כאן יושב פרופיל הטעם שהחידון בנה לך, האווטאר שבחרת, וה-XP שצברת בזירה.
            </p>
          </div>

          <div className="bg-black/50 border border-white/10 rounded-2xl p-6 text-center min-w-[150px] z-10">
            <div className="text-sm font-bold text-zinc-400 mb-1">XP נצבר</div>
            <div className="text-4xl font-black drop-shadow-[0_0_10px_rgba(225,29,72,0.4)]" style={{ color: accent.hex }}>{xp}</div>
            <Link
              href="/arena"
              className="mt-4 block text-xs font-bold text-white bg-white/10 hover:bg-white/20 w-full py-2 rounded-lg transition-colors"
            >
              שחק בזירה 👾
            </Link>
          </div>
        </div>

        {/* DNA & History Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* ה-DNA הקולנועי */}
          <div className="bg-[#111113] border border-white/5 rounded-2xl p-8">
            <h2 className="text-2xl font-black mb-6 flex items-center gap-2">
              <span className="text-indigo-500">🧬</span> ה-DNA הקולנועי שלך
            </h2>
            <div className="space-y-4">
              {!authUser && (
                <p className="text-zinc-400 text-sm">
                  התחבר כדי לראות את פרופיל הטעם שנשמר לך — ולקבל המלצה חדשה כל שבוע בלי לענות שוב.
                </p>
              )}
              {authUser && taste && !taste.hasProfile && (
                <p className="text-zinc-400 text-sm">
                  עוד לא עשית את השאלון — אחרי שתסיים אותו יופיע כאן הטעם האישי שלך, ברזולוציית תת-ז'אנר.
                </p>
              )}
              {(taste?.loved || []).map(({ term, score }) => (
                <div key={term}>
                  <div className="flex justify-between text-sm font-bold mb-1">
                    <span>{term}</span>
                    <span style={{ color: accent.hex }}>{Math.round(score * 100)}%</span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${Math.round(score * 100)}%`, backgroundColor: accent.hex, boxShadow: `0 0 10px ${accent.glow}` }}></div>
                  </div>
                </div>
              ))}
            </div>
            {/* This said "reset and recalibrate" and did nothing at all — no handler, no endpoint.
                Answering the quiz again IS the recalibration, so the button now says that and goes
                there. A true delete-my-profile control belongs with the privacy request flow. */}
            <Link
              href="/scan"
              className="mt-8 block text-center w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm text-zinc-300 transition-colors border border-white/5"
            >
              לענות על השאלון מחדש
            </Link>
          </div>

          {/* היסטוריית סריקות (Top 3 Matches) */}
          <div className="bg-[#111113] border border-white/5 rounded-2xl p-8">
            <h2 className="text-2xl font-black mb-6 flex items-center gap-2">
              <span className="text-rose-500">🏆</span> הסריקות האחרונות
            </h2>
            <div className="space-y-4">
              {/* The three films that used to sit here — שבעה חטאים 99%, התחלה 94%, מטריקס 91% —
                  were hardcoded and identical for every visitor. Scan history is not stored
                  anywhere yet, so there is nothing honest to list. */}
              <p className="text-zinc-400 text-sm">
                שמירת היסטוריית הסריקות עוד לא עלתה. הסרטים שקיבלת בחידון האחרון מופיעים במסך התוצאות עצמו.
              </p>
              {!!taste?.rejected?.length && (
                <div className="pt-4 mt-2 border-t border-white/5">
                  <div className="text-xs text-zinc-400 font-bold mb-2">ומה שלא נמליץ לך לעולם:</div>
                  <div className="flex flex-wrap gap-2">
                    {taste.rejected.map(({ term }) => (
                      <span key={term} className="text-xs bg-white/5 border border-white/10 text-zinc-400 rounded-lg px-2 py-1">{term}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Profile Customization Section */}
        <div className="mt-8 bg-[#111113] border border-white/5 rounded-2xl p-8">
          <h2 className="text-2xl font-black mb-6 flex items-center gap-2">
            <span style={{ color: accent.hex }}>✨</span> התאמה אישית
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Title Selector */}
            <div>
              <h3 className="text-sm font-bold text-zinc-400 mb-3">תואר קולנועי:</h3>
              <select 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-white/30 transition-colors"
              >
                {TITLES.map(t => <option key={t} value={t}>{locale === 'he' ? (TITLE_HE[t] || t) : t}</option>)}
              </select>
            </div>

            {/* Accent Color Selector */}
            <div>
              <h3 className="text-sm font-bold text-zinc-400 mb-3">צבע פרופיל (Neon Accent):</h3>
              <div className="flex gap-4">
                {COLORS.map(c => (
                  <button 
                    key={c.id}
                    onClick={() => setAccent(c)}
                    className={`w-10 h-10 rounded-full transition-all ${accent.id === c.id ? 'scale-125 border-2 border-white' : 'opacity-50 hover:opacity-100'} ${c.bg}`}
                    style={{ boxShadow: accent.id === c.id ? `0 0 15px ${c.glow}` : 'none' }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Referral System */}
        <div className="mt-8 bg-gradient-to-br from-[#111113] to-[#0a0a0c] border border-rose-500/20 rounded-2xl p-8 relative shadow-[0_0_50px_rgba(225,29,72,0.05)]">
          <div className="absolute top-4 right-4 bg-rose-500/20 text-rose-400 text-xs font-bold px-3 py-1 rounded-full border border-rose-500/30">
            חבר מביא חבר 🤝
          </div>
          
          <h2 className="text-2xl font-black mb-4 flex items-center gap-2">
            <span>🎁</span> חבר מביא חבר — בקרוב
          </h2>
          {/* This card used to hand out a referral link and promise a free ₪9 reveal per
              friend. Nothing counted invitations and no credit was ever granted, so the
              link and the counter are gone until the program actually exists. */}
          <p className="text-zinc-400 max-w-xl leading-relaxed">
            אנחנו בונים מסלול שבו הזמנת חברים מזכה אותך בהמלצות. הוא עוד לא פעיל, ולכן אין כאן לינק הפניה — כשנפעיל אותו זה יופיע בדיוק פה.
          </p>
        </div>

      </div>
    </div>
  );
}