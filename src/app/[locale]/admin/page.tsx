'use client';

import React, { useState } from 'react';
import { Link } from '@/i18n/routing';
import { CineMindLogo } from '@/components/Navbar';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  // נתוני דמי ללוח הבקרה (יחוברו ל-Firebase/Stripe בהמשך)
  const stats = {
    mrr: "₪12,450",
    activeUsers: "1,204",
    totalScans: "8,432",
    arenaMatches: "450"
  };

  const recentUsers = [
    { id: '1', email: 'idan@example.com', plan: 'Elite', tokens: 150, joined: 'לפני שעתיים' },
    { id: '2', email: 'shira@example.com', plan: 'Free', tokens: 10, joined: 'לפני 4 שעות' },
    { id: '3', email: 'omer@example.com', plan: 'Elite', tokens: 420, joined: 'לפני יום' },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-[#070709] text-white font-sans flex">
      
      {/* Sidebar */}
      <aside className="w-64 bg-[#0a0a0c] border-l border-white/5 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-white/5">
          <Link href="/" className="text-xl font-black flex items-center gap-2 text-rose-500">
            <CineMindLogo className="w-6 h-6" /> Admin
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab('overview')} className={`w-full text-right px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'overview' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>סקירה כללית</button>
          <button onClick={() => setActiveTab('users')} className={`w-full text-right px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'users' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>ניהול משתמשים</button>
          <button onClick={() => setActiveTab('settings')} className={`w-full text-right px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'settings' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>הגדרות אלגוריתם</button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-10">
          <h1 className="text-3xl font-black">לוח בקרה</h1>
          <div className="flex gap-4">
            <button className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg font-bold text-sm transition-all shadow-[0_0_15px_rgba(225,29,72,0.4)]">
              + קמפיין אימיילים
            </button>
          </div>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <div className="bg-[#111113] p-6 rounded-2xl border border-white/5">
            <div className="text-zinc-500 text-sm font-bold mb-2">הכנסה חודשית (MRR)</div>
            <div className="text-4xl font-black text-emerald-400">{stats.mrr}</div>
          </div>
          <div className="bg-[#111113] p-6 rounded-2xl border border-white/5">
            <div className="text-zinc-500 text-sm font-bold mb-2">משתמשים פעילים</div>
            <div className="text-4xl font-black">{stats.activeUsers}</div>
          </div>
          <div className="bg-[#111113] p-6 rounded-2xl border border-white/5">
            <div className="text-zinc-500 text-sm font-bold mb-2">סריקות AI החודש</div>
            <div className="text-4xl font-black text-indigo-400">{stats.totalScans}</div>
          </div>
          <div className="bg-[#111113] p-6 rounded-2xl border border-white/5">
            <div className="text-zinc-500 text-sm font-bold mb-2">קרבות זירה (Arena)</div>
            <div className="text-4xl font-black text-rose-400">{stats.arenaMatches}</div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-[#111113] border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-xl font-bold">משתמשים אחרונים</h2>
            <input type="text" placeholder="חיפוש משתמש..." className="bg-black border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-rose-500" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-white/[0.02] text-zinc-500 text-sm">
                <tr>
                  <th className="p-4 font-bold">אימייל</th>
                  <th className="p-4 font-bold">מסלול</th>
                  <th className="p-4 font-bold">טוקנים</th>
                  <th className="p-4 font-bold">הצטרף</th>
                  <th className="p-4 font-bold">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {recentUsers.map(user => (
                  <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 font-medium text-white">{user.email}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${user.plan === 'Elite' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-400'}`}>
                        {user.plan}
                      </span>
                    </td>
                    <td className="p-4 text-rose-400 font-bold">{user.tokens} 👾</td>
                    <td className="p-4 text-zinc-500">{user.joined}</td>
                    <td className="p-4">
                      <button className="text-xs border border-white/10 px-3 py-1.5 rounded hover:bg-white/10 transition-colors">ערוך פרופיל</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}