import React from 'react';
import { GamePhase } from '../types';

interface PauseMenuProps {
  phase: GamePhase;
  onResume: () => void;
}

const PauseMenu: React.FC<PauseMenuProps> = ({ phase, onResume }) => {
  if (phase !== GamePhase.PAUSED) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center crt">
      {/* Scanline Effect */}
      <div className="scanline"></div>

      <div className="relative w-full max-w-md bg-[#0a0a0a] border-2 border-green-800 p-1 shadow-[0_0_20px_rgba(0,255,0,0.2)]">
        {/* Inner Border Frame */}
        <div className="border border-green-900/50 p-6 flex flex-col items-center">
            
            {/* Header */}
            <h2 className="text-4xl text-green-500 font-bold uppercase tracking-[0.3em] mb-2 animate-pulse text-shadow-glow">
                СИСТЕМА НА ПАУЗЕ
            </h2>
            <div className="w-full h-px bg-green-900 mb-8 relative">
                <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 w-2 h-3 bg-[#0a0a0a] border-l border-r border-green-800"></div>
            </div>
            
            <div className="space-y-4 w-full px-4">
            <button 
                onClick={onResume}
                className="group w-full py-4 bg-green-900/20 border border-green-700 text-green-400 font-mono font-bold uppercase hover:bg-green-500 hover:text-black hover:scale-105 hover:shadow-[0_0_15px_rgba(0,255,0,0.6)] transition-all duration-200"
            >
                <span className="flex items-center justify-center gap-2">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">►</span> 
                    ПРОДОЛЖИТЬ СМЕНУ
                </span>
            </button>
            
            <button 
                onClick={() => window.location.reload()}
                className="group w-full py-4 bg-red-900/10 border border-red-900/50 text-red-700 font-mono font-bold uppercase hover:bg-red-600 hover:text-black hover:border-red-500 hover:scale-105 transition-all duration-200"
            >
                <span className="flex items-center justify-center gap-2">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">✕</span> 
                    ПРЕРВАТЬ СОЕДИНЕНИЕ
                </span>
            </button>
            </div>

            {/* Footer Status */}
            <div className="mt-8 text-[10px] text-green-900 font-mono tracking-widest text-center w-full border-t border-green-900/30 pt-2">
                СТАТУС: ОЖИДАНИЕ ВВОДА ОПЕРАТОРА... <span className="animate-pulse">_</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default PauseMenu;