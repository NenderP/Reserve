import React, { useEffect, useState } from 'react';
import { LOADING_TIPS } from '../constants';

interface LoadingScreenProps {
  progress: number; // 0 to 100
  isVisible: boolean;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ progress, isVisible }) => {
  const [tip, setTip] = useState("");

  useEffect(() => {
    // Pick a random tip on mount
    const randomTip = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
    setTip(randomTip);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 z-[999] bg-[#020202] flex flex-col items-center justify-center font-mono text-green-500 overflow-hidden">
      {/* Background Grid Effect */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ 
             backgroundImage: 'linear-gradient(#113311 1px, transparent 1px), linear-gradient(90deg, #113311 1px, transparent 1px)', 
             backgroundSize: '40px 40px' 
           }}>
      </div>
      
      <div className="max-w-2xl w-full px-8 relative z-10 flex flex-col items-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-[0.2em] mb-12 text-white animate-pulse">
          ЗАГРУЗКА
        </h1>

        {/* Progress Bar Container */}
        <div className="w-full h-2 bg-green-900/30 border border-green-800 relative overflow-hidden mb-4">
          <div 
            className="h-full bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.8)] transition-all duration-300 ease-out relative"
            style={{ width: `${progress}%` }}
          >
            {/* Moving shine effect on bar */}
            <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]"></div>
          </div>
        </div>

        <div className="w-full flex justify-between text-xs text-green-700 mb-16 font-bold">
           <span>INITIALIZING_ASSETS...</span>
           <span>{Math.round(progress)}%</span>
        </div>

        {/* Tip Container */}
        <div className="bg-black/50 border-l-2 border-green-600 p-6 max-w-lg backdrop-blur-sm">
           <div className="text-xs text-gray-500 mb-2 uppercase tracking-widest">Совет по выживанию:</div>
           <p className="text-lg text-gray-300 italic">"{tip}"</p>
        </div>
      </div>

      {/* Footer Version */}
      <div className="absolute bottom-4 right-4 text-[10px] text-green-900">
        SHADOW_WATCHER_ENGINE // V.0.9.2
      </div>
    </div>
  );
};

export default LoadingScreen;