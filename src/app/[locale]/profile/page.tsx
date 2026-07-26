'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase';

const TITLES = ["Master of Horror", "Space Explorer", "Action Hero", "Comedy Genius", "Drama Queen", "Cinematic Architect"];
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
  
  // נתוני דמי של משתמש מחובר
  const user = {
    name: "עידן",
    plan: "CineMind Elite",
    tokens: 420,
    topGenres: ["Dark Comedy", "Psychological Thriller", "Cyberpunk"],
    avatars: [
      `https://api.dicebear.com/7.x/avataaars/svg?seed=Idan&backgroundColor=${accent.hex.replace('#','')}`,
      `https://api.dicebear.com/7.x/bottts/svg?seed=Idan&backgroundColor=${accent.hex.replace('#','')}`,
      `https://api.dicebear.com/7.x/micah/svg?seed=Idan&backgroundColor=${accent.hex.replace('#','')}`,
      `https://api.dicebear.com/7.x/adventurer/svg?seed=Idan&backgroundColor=${accent.hex.replace('#','')}`
    ]
  };

  const { user: authUser, loading } = useAuth();
  const [xp, setXp] = useState(0);
  const [referrals, setReferrals] = useState(0);
  
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
  } | null>(null);
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await authUser.getIdToken();
        const res = await fetch('/api/user/profile', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok && !cancelled) setTaste(await res.json());
      } catch { /* leave the empty state — never block the page on this */ }
    })();
    return () => { cancelled = true; };
  }, [authUser]);

  const copyReferralLink = () => {
    const link = `https://cinemind.co/?ref=${authUser?.uid || 'guest'}`;
    navigator.clipboard.writeText(link);
    alert('הלינק הועתק! שלח לחברים כדי להרוויח עוד קרדיטים.');
  };

  const currentAvatar = user.avatars[avatarIndex];

  if (loading) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#070709] text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-rose-500"></div>
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#070709] text-white font-sans overflow-x-hidden pb-20">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 mt-12">
        {/* Header Profile */}
        <div className="bg-[#111113] border border-white/5 rounded-[2rem] p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden shadow-2xl mb-8 transition-all duration-500" style={{ boxShadow: `0 20px 40px -10px ${accent.glow}` }}>
          <div className="absolute top-0 right-0 w-64 h-64 blur-[100px] pointer-events-none transition-colors duration-500" style={{ backgroundColor: accent.glow }}></div>
          
          <div className="w-32 h-32 rounded-full border-4 p-1 relative bg-zinc-900 transition-colors duration-500" style={{ borderColor: accent.hex, boxShadow: `0 0 30px ${accent.glow}` }}>
            <img src={currentAvatar} alt="Avatar" className="w-full h-full rounded-full transition-all duration-500" />
            <button 
              onClick={() => setAvatarIndex((prev) => (prev + 1) % user.avatars.length)}
              className="absolute bottom-0 right-0 w-8 h-8 bg-white text-black rounded-full flex items-center justify-center font-bold shadow-lg hover:scale-110 transition-transform"
            >
              ↻
            </button>
          </div>

          <div className="flex-1 text-center md:text-right z-10">
            <h1 className="text-4xl font-black mb-1">{authUser?.displayName || authUser?.email?.split('@')[0] || (taste?.hasProfile ? 'הפרופיל שלך' : 'אורח')}</h1>
            <div className="text-xl font-bold mb-3 transition-colors duration-500" style={{ color: accent.hex }}>{title}</div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-sm font-bold mb-2">
              👑 {taste?.isPremium ? 'CineMind Elite' : 'חשבון חינם'}
            </div>
            <div className="text-xs text-zinc-500 mb-4 font-mono">
              {!isFirebaseConfigured ? "אורח זמני" : 
                (authUser?.isAnonymous ? "אורח זמני" : authUser?.email)}
            </div>
            <p className="text-zinc-400 text-sm max-w-md">
              כמשתמש Elite, יש לך גישה לניהול מתקדם של ה-DNA שלך, התאמת אווטאר אישית, וכניסה חופשית לזירת הטריוויה.
            </p>
          </div>

          <div className="bg-black/50 border border-white/10 rounded-2xl p-6 text-center min-w-[150px] z-10">
            <div className="text-sm font-bold text-zinc-500 mb-1">XP נצבר</div>
            <div className="text-4xl font-black drop-shadow-[0_0_10px_rgba(225,29,72,0.4)]" style={{ color: accent.hex }}>{xp}</div>
            <button className="mt-4 text-xs font-bold text-white bg-white/10 hover:bg-white/20 w-full py-2 rounded-lg transition-colors">
              שחק בזירה 👾
            </button>
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
            <button className="mt-8 w-full py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm text-zinc-300 transition-colors border border-white/5">
              איפוס וכיול מחדש
            </button>
          </div>

          {/* היסטוריית סריקות (Top 3 Matches) */}
          <div className="bg-[#111113] border border-white/5 rounded-2xl p-8">
            <h2 className="text-2xl font-black mb-6 flex items-center gap-2">
              <span className="text-rose-500">🏆</span> הסריקות האחרונות
            </h2>
            <div className="space-y-4">
              {[
                { title: 'שבעה חטאים', match: 99, date: 'היום' },
                { title: 'התחלה', match: 94, date: 'אתמול' },
                { title: 'מטריקס', match: 91, date: 'לפני 3 ימים' }
              ].map((item, idx) => (
                <div key={idx} className="flex justify-between items-center p-4 bg-black/40 rounded-xl border border-white/5">
                  <div>
                    <div className="font-bold text-white">{item.title}</div>
                    <div className="text-xs text-zinc-500">{item.date}</div>
                  </div>
                  <div className="bg-rose-500/10 text-rose-500 px-3 py-1 rounded font-bold text-sm border border-rose-500/20">
                    {item.match}% התאמה
                  </div>
                </div>
              ))}
              {!!taste?.rejected?.length && (
                <div className="pt-4 mt-2 border-t border-white/5">
                  <div className="text-xs text-zinc-500 font-bold mb-2">ומה שלא נמליץ לך לעולם:</div>
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
            <span style={{ color: accent.hex }}>✨</span> התאמה אישית (Elite)
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
                {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
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
            <span>🎁</span> קבל המלצות בחינם
          </h2>
          <p className="text-zinc-400 mb-8 max-w-xl leading-relaxed">
            שתף את הלינק הייחודי שלך עם חברים. על כל חבר שייכנס וישלים את החידון, אתה תקבל <strong className="text-white">חשיפת סרט אחת בחינם (בשווי ₪9)</strong>.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 items-stretch mb-8">
            <div className="flex-1 bg-black border border-white/10 rounded-xl px-4 py-3 flex items-center font-mono text-sm text-zinc-500 overflow-hidden text-ellipsis whitespace-nowrap">
              https://cinemind.co/?ref={authUser?.uid || 'guest'}
            </div>
            <button 
              onClick={copyReferralLink}
              className="px-8 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(225,29,72,0.3)] whitespace-nowrap"
            >
              העתק לינק
            </button>
          </div>

          <div className="flex items-center gap-4 text-sm font-bold bg-white/5 inline-flex px-4 py-2 rounded-lg border border-white/5">
            <span className="text-zinc-400">חברים שהזמנת:</span>
            <span className="text-rose-400 text-lg">{referrals}</span>
          </div>
        </div>

      </div>
    </main>
  );
}