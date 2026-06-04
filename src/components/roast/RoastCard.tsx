import React from 'react';

type RoastCardProps = {
  handle: string;
  archetype: string;
  roastText: string;
  topGenres: string[];
  contrarianScore: number;
  confidenceScore: number;
};

export default function RoastCard({ handle, archetype, roastText, topGenres, contrarianScore, confidenceScore }: RoastCardProps) {
  return (
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl relative overflow-hidden">
      {/* FOMO glow */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500" />
      
      <h1 className="text-3xl font-black mb-2 tracking-tight text-white">
        {handle}<span className="text-zinc-500">'s DNA</span>
      </h1>
      
      <div className="inline-block px-3 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded-full text-sm font-bold mb-6">
        {archetype}
      </div>

      <p className="text-lg text-zinc-300 leading-relaxed italic mb-8 border-l-2 border-zinc-800 pl-4">
        "{roastText}"
      </p>

      <div className="space-y-4">
        <div>
          <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2">Top Genres</h3>
          <div className="flex flex-wrap gap-2">
            {topGenres.map((g: string) => (
              <span key={g} className="px-2 py-1 bg-zinc-800 rounded text-sm text-zinc-300">{g}</span>
            ))}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-800">
          <div>
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Contrarian</h3>
            <p className="text-xl font-bold text-white">{Math.round(contrarianScore * 100)}%</p>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Confidence</h3>
            <p className="text-xl font-bold text-white">{Math.round(confidenceScore * 100)}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
