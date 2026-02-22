import React, { useEffect, useState } from 'react';
import { LeaderboardService } from '../services/LeaderboardService';
import { ScoreEntry } from '../types';

interface GameOverScreenProps {
  wave: number;
  kills: number;
}

const GameOverScreen: React.FC<GameOverScreenProps> = ({ wave, kills }) => {
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    // Save current run and get updated leaderboard
    const newLeaderboard = LeaderboardService.addScore(wave, kills);
    setLeaderboard(newLeaderboard);
  }, [wave, kills]);

  return (
    <div className="absolute inset-0 z-[100] bg-black flex items-center justify-center flex-col text-red-600 font-mono">
      <div className="max-w-4xl w-full p-8 border-4 border-red-900 bg-black/90 relative crt">
          <div className="scanline"></div>
          
          <h1 className="text-6xl font-bold mb-8 text-center animate-pulse tracking-widest text-shadow-glow">СИСТЕМНЫЙ СБОЙ</h1>
          
          <div className="grid grid-cols-2 gap-8 mb-8">
              <div className="border border-red-900 p-6 bg-red-950/20">
                  <h2 className="text-2xl text-white mb-4 border-b border-red-900 pb-2">ВАШ РЕЗУЛЬТАТ</h2>
                  <div className="space-y-4">
                      <div className="flex justify-between items-end">
                          <span className="text-gray-400">ПЕРЕЖИТО ВОЛН:</span>
                          <span className="text-4xl text-white font-bold">{wave}</span>
                      </div>
                      <div className="flex justify-between items-end">
                          <span className="text-gray-400">УСТРАНЕНО УГРОЗ:</span>
                          <span className="text-4xl text-white font-bold">{kills}</span>
                      </div>
                      <div className="mt-8 text-sm text-red-400 italic">
                          "Они всегда возвращаются..."
                      </div>
                  </div>
              </div>

              <div className="border border-red-900 p-6 bg-red-950/10">
                  <h2 className="text-xl text-white mb-4 border-b border-red-900 pb-2">АРХИВ СМОТРИТЕЛЕЙ</h2>
                  <div className="space-y-2 text-sm overflow-y-auto max-h-60 custom-scrollbar">
                      <div className="grid grid-cols-4 text-gray-500 text-xs mb-2">
                          <span>#</span>
                          <span>ДАТА</span>
                          <span className="text-right">ВОЛНА</span>
                          <span className="text-right">УБИТО</span>
                      </div>
                      {leaderboard.map((entry, idx) => (
                          <div key={idx} className={`grid grid-cols-4 ${idx === 0 ? 'text-yellow-500 font-bold' : 'text-gray-300'}`}>
                              <span>{idx + 1}</span>
                              <span className="opacity-50 text-xs">{entry.date}</span>
                              <span className="text-right">{entry.wave}</span>
                              <span className="text-right">{entry.kills}</span>
                          </div>
                      ))}
                  </div>
              </div>
          </div>

          <div className="text-center">
              <button 
                onClick={() => window.location.reload()} 
                className="px-12 py-4 border-2 border-red-600 text-red-600 font-bold hover:bg-red-600 hover:text-white transition-all duration-200 uppercase tracking-widest text-xl"
              >
                  ПЕРЕЗАГРУЗИТЬ СИСТЕМУ
              </button>
          </div>
          
          <div className="absolute bottom-2 right-4 text-[10px] text-red-900">
              ERROR_CODE: G-9_DESTROYED
          </div>
      </div>
    </div>
  );
};

export default GameOverScreen;