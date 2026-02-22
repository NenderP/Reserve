
import React from 'react';
import { GamePhase } from '../types';

interface UIOverlayProps {
  phase: GamePhase;
  battery: number;
  hp: number;
  wave: number;
  hoverInfo?: { isHovering: boolean, text: string };
  isGenDisabled?: boolean;
  restartProgress?: number;
  flares?: number;
  stamina?: number; 
  overchargeCooldown?: number;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ 
    phase, battery, hp, wave, hoverInfo, isGenDisabled, restartProgress, flares = 0, stamina = 100, overchargeCooldown = 1
}) => {
  if (phase === GamePhase.MENU) return null;

  const batteryColor = battery > 50 ? 'bg-green-500' : battery > 20 ? 'bg-yellow-500' : 'bg-red-600';
  const hpColor = hp > 50 ? 'text-green-500' : 'text-red-500';

  const batteryWidth = Math.max(0, Math.min(100, battery));
  const staminaWidth = Math.max(0, Math.min(100, stamina));
  
  const traumaLevel = Math.max(0, (100 - stamina) / 100) + (100 - hp) / 200;
  const isStressed = traumaLevel > 0.3;

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (overchargeCooldown || 0) * circumference;

  return (
    <div className={`absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-6 overflow-hidden ${isStressed ? 'animate-pulse-slow' : ''}`}>
      
      {/* Trauma Vignette */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-300"
        style={{ 
            boxShadow: `inset 0 0 ${traumaLevel * 100}px rgba(255,0,0,${traumaLevel * 0.5})`,
            opacity: traumaLevel > 0.1 ? 1 : 0
        }}
      />

      {/* Top Bar */}
      <div className="flex justify-between items-start relative z-10">
        <div className="bg-black/50 p-4 border border-white/20 backdrop-blur-sm rounded">
            <h1 className="text-white text-xl font-bold tracking-widest uppercase mb-1">Shadow Watcher</h1>
            <div className="text-gray-400 text-sm">ВОЛНА <span className="text-white font-mono text-lg">{wave}</span></div>
        </div>
        
        <div className="bg-black/50 p-4 border border-white/20 backdrop-blur-sm rounded text-right">
             <div className="text-gray-400 text-xs uppercase mb-1">Состояние Генератора</div>
             <div className={`text-4xl font-mono font-bold ${hpColor}`}>{hp.toFixed(0)}%</div>
        </div>
      </div>

      {isGenDisabled && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 text-center z-20">
            <div className="text-red-600 font-bold text-3xl animate-pulse mb-2 tracking-widest bg-black/80 px-4 py-2 border-2 border-red-600">
                ГЕНЕРАТОР ОТКЛЮЧЕН
            </div>
            <div className="text-white text-sm bg-black/50 px-2 py-1">
                ЗАЖМИТЕ [E] У ГЕНЕРАТОРА ДЛЯ ПЕРЕЗАПУСКА
            </div>
            {(restartProgress || 0) > 0 && (
                <div className="w-64 h-4 bg-gray-900 border border-white/30 mt-2 mx-auto">
                    <div 
                        className="h-full bg-yellow-500" 
                        style={{ width: `${(restartProgress || 0) * 100}%` }} 
                    />
                </div>
            )}
        </div>
      )}

      {hoverInfo?.isHovering && phase === GamePhase.DAY && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-8 z-20">
              <div className="bg-black/80 border border-green-500 text-green-500 px-4 py-2 rounded text-sm font-bold uppercase tracking-widest animate-pulse">
                  {hoverInfo.text}
              </div>
          </div>
      )}

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/50 rounded-full mix-blend-difference z-10" />

      {/* Bottom Bar */}
      <div className="flex justify-between items-end w-full relative z-10">
         <div className="flex items-end gap-4">
            <div className="bg-black/70 border border-gray-600 p-3 rounded flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-900 flex items-center justify-center border border-red-500">
                    <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
                </div>
                <div>
                    <div className="text-xs text-red-400 font-bold">FLARES [G]</div>
                    <div className="text-xl text-white font-mono">{flares}</div>
                </div>
            </div>

            {/* Overcharge Cooldown */}
            <div className="relative w-16 h-16">
                 <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r={radius} stroke="rgba(255,255,255,0.1)" strokeWidth="4" fill="transparent" />
                    <circle 
                        cx="32" cy="32" r={radius} 
                        stroke="cyan" strokeWidth="4" fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        className="transition-all duration-200"
                        style={{ strokeLinecap: 'round', filter: `drop-shadow(0 0 5px cyan)` }}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-white font-mono text-xs">
                    [ПКМ]
                </div>
            </div>
         </div>

         <div className="flex flex-col gap-2">
             <div className="w-64 bg-black/70 border border-gray-600 p-2 rounded">
                <div className="flex justify-between text-xs text-gray-300 mb-1">
                    <span>ЗАРЯД ФОНАРЯ</span>
                    <span>{battery.toFixed(0)}%</span>
                </div>
                <div className="h-3 w-full bg-gray-800 rounded overflow-hidden">
                    <div 
                        className={`h-full ${batteryColor}`} 
                        style={{ width: `${batteryWidth}%` }}
                    />
                </div>
             </div>
             
             <div className="w-64 bg-black/50 border border-gray-600 p-1 rounded">
                <div className="h-1.5 w-full bg-gray-900 rounded overflow-hidden">
                    <div 
                        className="h-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.8)]" 
                        style={{ width: `${staminaWidth}%` }}
                    />
                </div>
             </div>
         </div>
      </div>
    </div>
  );
};

export default UIOverlay;
