'use client';

import React, { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { Link } from '@/i18n/routing';
import { isFirebaseConfigured } from '@/lib/firebase';

interface Player {
  id: string;
  name: string;
  xp: number;
  avatar: string;
  isCurrentUser?: boolean;
}

const MOCK_PLAYERS: Player[] = [
  { id: '1', name: 'Alon_CineMaster', xp: 14500, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alon&backgroundColor=f59e0b' },
  { id: '2', name: 'MovieGeek99', xp: 12400, avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Geek&backgroundColor=6366f1' },
  { id: '3', name: 'PopcornAddict', xp: 9800, avatar: 'https://api.dicebear.com/7.x/micah/svg?seed=Popcorn&backgroundColor=f43f5e' },
  { id: '4', name: 'Tarantino_Fan', xp: 8200, avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Quentin&backgroundColor=10b981' },
  { id: '5', name: 'DarkKnight23', xp: 7500, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bruce&backgroundColor=000000' },
  { id: '6', name: 'SpilebergRulez', xp: 6300, avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Steven&backgroundColor=3b82f6' },
  { id: '7', name: 'Cinemaphile_IL', xp: 5100, avatar: 'https://api.dicebear.com/7.x/micah/svg?seed=Cinemaphile&backgroundColor=ec4899' },
  { id: '8', name: 'MatrixNeo', xp: 4800, avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Neo&backgroundColor=14b8a6' },
  { id: '9', name: 'FilmBro', xp: 4200, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bro&backgroundColor=8b5cf6' },
];

export default function LeaderboardPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [myXp, setMyXp] = useState(0);

  useEffect(() => {
    // In a real app with Firebase configured, we would fetch from Firestore collection 'users' order by xp desc.
    // For now, we mix the mock players with the current user's local XP.
    
    const savedXp = parseInt(localStorage.getItem('cinemind_xp') || '0', 10);
    setMyXp(savedXp);
    
    const me: Player = {
      id: 'me',
      name: 'את/ה (אורח)',
      xp: savedXp,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Me&backgroundColor=ef4444',
      isCurrentUser: true
    };

    const combined = [...MOCK_PLAYERS, me].sort((a, b) => b.xp - a.xp).slice(0, 10);
    setPlayers(combined);
  }, []);

  return (
    <main dir="rtl" className="min-h-screen bg-[#070709] text-white font-sans overflow-x-hidden pb-20 selection:bg-rose-500/30">
      
      {/* Dynamic Background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[600px] bg-indigo-900/10 blur-[120px] pointer-events-none"></div>

      <Navbar />

      <div className="relative z-10 max-w-3xl mx-auto px-4 mt-8 md:mt-16 flex flex-col items-center">
        
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-bold mb-6">
          <span>🏆</span>
          <span>CineMind Hall of Fame</span>
        </div>

        <h1 className="text-4xl md:text-5xl font-black mb-4 text-center tracking-tight">
          הטובים ביותר <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-rose-500">בזירה</span>
        </h1>
        
        <p className="text-zinc-400 mb-10 text-center max-w-md mx-auto">
          תשחק בזירה, תצבור נקודות, ותוכיח לכולם שהטעם הקולנועי שלך הוא לא פח זבל.
        </p>

        {/* Podium (Top 3) */}
        <div className="flex items-end justify-center gap-2 sm:gap-4 md:gap-6 mb-16 w-full mt-10">
          
          {/* 2nd Place */}
          {players[1] && (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
              <div className="text-2xl mb-2 drop-shadow-lg">🥈</div>
              <img src={players[1].avatar} alt="Avatar" className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-zinc-300 shadow-[0_0_20px_rgba(212,212,216,0.3)] ${players[1].isCurrentUser ? 'ring-4 ring-rose-500' : ''}`} />
              <div className="mt-3 text-sm font-bold text-zinc-300 truncate w-24 text-center">{players[1].name}</div>
              <div className="text-xs text-indigo-400 font-black font-mono">{players[1].xp} XP</div>
              <div className="w-20 sm:w-24 h-24 sm:h-32 bg-gradient-to-t from-zinc-300/20 to-transparent mt-4 rounded-t-lg border-t border-x border-zinc-300/30 flex items-end justify-center pb-4 text-2xl font-black text-zinc-400">2</div>
            </div>
          )}

          {/* 1st Place */}
          {players[0] && (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-12 duration-700 z-10">
              <div className="text-4xl mb-2 drop-shadow-[0_0_15px_rgba(250,204,21,0.6)]">👑</div>
              <img src={players[0].avatar} alt="Avatar" className={`w-20 h-20 sm:w-28 sm:h-28 rounded-full border-4 border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.5)] ${players[0].isCurrentUser ? 'ring-4 ring-rose-500' : ''}`} />
              <div className="mt-3 text-base font-black text-white truncate w-28 text-center drop-shadow-md">{players[0].name}</div>
              <div className="text-sm text-yellow-400 font-black font-mono drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]">{players[0].xp} XP</div>
              <div className="w-24 sm:w-32 h-32 sm:h-44 bg-gradient-to-t from-yellow-400/20 to-transparent mt-4 rounded-t-xl border-t border-x border-yellow-400/40 flex items-end justify-center pb-4 text-4xl font-black text-yellow-500 drop-shadow-md">1</div>
            </div>
          )}

          {/* 3rd Place */}
          {players[2] && (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              <div className="text-2xl mb-2 drop-shadow-lg">🥉</div>
              <img src={players[2].avatar} alt="Avatar" className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 border-orange-400 shadow-[0_0_20px_rgba(251,146,60,0.3)] ${players[2].isCurrentUser ? 'ring-4 ring-rose-500' : ''}`} />
              <div className="mt-3 text-sm font-bold text-zinc-400 truncate w-20 text-center">{players[2].name}</div>
              <div className="text-xs text-orange-400 font-black font-mono">{players[2].xp} XP</div>
              <div className="w-16 sm:w-20 h-20 sm:h-24 bg-gradient-to-t from-orange-400/20 to-transparent mt-4 rounded-t-lg border-t border-x border-orange-400/30 flex items-end justify-center pb-4 text-xl font-black text-orange-500">3</div>
            </div>
          )}

        </div>

        {/* Leaderboard List */}
        <div className="w-full bg-[#111113]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-4 sm:p-8 shadow-2xl animate-in fade-in duration-1000 delay-300">
          <div className="space-y-2 sm:space-y-3">
            {players.slice(3).map((player, index) => (
              <div 
                key={player.id} 
                className={`flex items-center gap-4 p-3 sm:p-4 rounded-2xl transition-all ${player.isCurrentUser ? 'bg-rose-500/10 border border-rose-500/30 shadow-[0_0_15px_rgba(225,29,72,0.1)]' : 'bg-white/[0.02] border border-white/5 hover:bg-white/[0.04]'}`}
              >
                <div className="w-8 text-center text-zinc-500 font-black text-lg">#{index + 4}</div>
                <img src={player.avatar} alt="Avatar" className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-white/10" />
                <div className="flex-1 font-bold text-white truncate text-sm sm:text-base">
                  {player.name}
                  {player.isCurrentUser && <span className="ml-2 text-[10px] bg-rose-500 text-white px-2 py-0.5 rounded-full inline-block align-middle">זה אתה!</span>}
                </div>
                <div className="text-indigo-400 font-black font-mono text-sm sm:text-base">{player.xp} XP</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 w-full max-w-sm">
          <Link 
            href="/arena" 
            className="w-full flex items-center justify-center gap-2 py-4 bg-white hover:bg-zinc-200 text-black rounded-2xl font-black text-xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-105"
          >
            חזור לזירה והעלה את ה-XP שלך 👾
          </Link>
        </div>

      </div>
    </main>
  );
}
