import React, { useState, useEffect, useMemo } from 'react';
import { GamePhase, FlashlightMode } from '../types';

interface UIOverlayProps {
  phase: GamePhase;
  battery: number;
  hp: number;
  wave: number;
  hoverInfo?: { isHovering: boolean, text: string };
  isGenDisabled?: boolean;
  restartProgress?: number;
  flares?: number;
  mines?: number;
  ammo?: number;
  hasTurret?: boolean;
  stamina?: number; 
  overchargeCooldown?: number;
  dashCooldown?: number;
  hitMarkerTrigger?: number;
  credits?: number;
  isAimingEnemy?: boolean;
  isBloodMoon?: boolean;
  nearestEnemyDistance?: number | null;
  flashlightMode?: FlashlightMode;
  tutorialText?: string | null;
  radioMessage?: string | null;
}

const GameUI = (props: UIOverlayProps) => {
  const { 
    phase, battery, hp, wave, hoverInfo, isGenDisabled, restartProgress, flares = 0, mines = 0, ammo = 0, hasTurret = false, stamina = 100, overchargeCooldown = 1, dashCooldown = 1, hitMarkerTrigger = 0, credits = 0, isAimingEnemy = false, isBloodMoon = false, nearestEnemyDistance = null, flashlightMode = FlashlightMode.NORMAL, tutorialText, radioMessage
  } = props;

  if (phase === GamePhase.MENU) return null;

  const batteryColor = battery > 50 ? 'bg-green-500' : battery > 20 ? 'bg-yellow-500' : 'bg-red-600 animate-pulse';
  const hpColor = hp > 50 ? 'text-green-500' : hp > 30 ? 'text-yellow-500' : 'text-red-500 animate-pulse';

  const batteryWidth = Math.max(0, Math.min(100, battery));
  const staminaWidth = Math.max(0, Math.min(100, stamina));

  // Hit marker visibility logic
  const [showHitMarker, setShowHitMarker] = useState(false);
  const [lastTrigger, setLastTrigger] = useState(0);

  useEffect(() => {
      if (hitMarkerTrigger > lastTrigger) {
          setShowHitMarker(true);
          setLastTrigger(hitMarkerTrigger);
      }
  }, [hitMarkerTrigger, lastTrigger]);

  useEffect(() => {
      if (showHitMarker) {
          const timer = setTimeout(() => setShowHitMarker(false), 200);
          return () => clearTimeout(timer);
      }
  }, [showHitMarker]);
  
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (overchargeCooldown || 0) * circumference;
  const dashOffset = circumference - (dashCooldown || 0) * circumference;

  return (
    <div className={`absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-6 overflow-hidden`}>
      
      {/* Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
        <div className="relative flex items-center justify-center">
          <div className="w-1 h-1 bg-white/50 rounded-full" />
          <div className="absolute w-4 h-[1px] bg-white/20" />
          <div className="absolute h-4 w-[1px] bg-white/20" />
        </div>
      </div>

      {/* Tutorial Overlay */}
      {tutorialText ? (
        <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 text-center z-50 pointer-events-none">
          <div className="bg-black/90 border-2 border-green-500/80 p-6 rounded-lg shadow-[0_0_30px_rgba(0,255,0,0.3)] backdrop-blur-md">
            <p className="text-green-400 font-mono text-xl uppercase tracking-widest whitespace-pre-line leading-relaxed">
              {tutorialText}
            </p>
          </div>
        </div>
      ) : null}

      {/* Top Bar */}
      <div className="flex justify-between items-start relative z-10">
        <div className="bg-black/50 p-4 border border-white/20 backdrop-blur-sm rounded">
            <h1 className="text-white text-xl font-bold tracking-widest uppercase mb-1">Shadow Watcher</h1>
            <div className="flex gap-4">
                <div className="text-gray-400 text-sm">ВОЛНА <span className="text-white font-mono text-lg">{wave}</span></div>
                <div className="text-gray-400 text-sm">КРЕДИТЫ <span className="text-yellow-500 font-mono text-lg">{credits}</span></div>
            </div>
            {isBloodMoon ? (
                <div className="mt-2 text-red-600 font-bold text-sm animate-pulse tracking-widest uppercase">
                    КРОВАВАЯ ЛУНА
                </div>
            ) : null}
            {nearestEnemyDistance !== null && nearestEnemyDistance < 25 ? (
                <div className={`mt-2 text-xs font-mono font-bold px-2 py-1 rounded border ${nearestEnemyDistance < 10 ? 'bg-red-900/80 border-red-500 text-red-200 animate-pulse' : 'bg-yellow-900/80 border-yellow-500 text-yellow-200'}`}>
                    [СЕНСОР]: ЦЕЛЬ В {nearestEnemyDistance.toFixed(1)}М
                </div>
            ) : null}
        </div>
        
        <div className="bg-black/50 p-4 border border-white/20 backdrop-blur-sm rounded text-right">
             <div className="text-gray-400 text-xs uppercase mb-1">Состояние Генератора</div>
             <div className={`text-4xl font-mono font-bold ${hpColor}`}>{hp.toFixed(0)}%</div>
        </div>
      </div>

      {isGenDisabled ? (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 text-center z-20 pointer-events-none">
            <div className="text-red-600 font-mono text-4xl font-bold animate-pulse tracking-widest uppercase drop-shadow-[0_0_10px_rgba(220,38,38,0.8)] mb-2">
                КРИТИЧЕСКАЯ ОШИБКА
            </div>
            <div className="text-red-400 font-mono text-xl bg-black/80 px-4 py-2 border border-red-500/50 rounded">
                ГЕНЕРАТОР ОТКЛЮЧЕН. ЗАЖМИТЕ [E] ДЛЯ ПЕРЕЗАПУСКА.
            </div>
            {(restartProgress || 0) > 0 ? (
                <div className="w-64 h-4 bg-gray-900 border border-white/30 mt-4 mx-auto relative overflow-hidden">
                    <div 
                        className="h-full bg-yellow-500 transition-all duration-100" 
                        style={{ width: `${(restartProgress || 0) * 100}%` }} 
                    />
                </div>
            ) : null}
        </div>
      ) : null}

      {hoverInfo?.isHovering && phase === GamePhase.DAY ? (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-8 z-20">
              <div className="bg-black/80 border border-green-500 text-green-500 px-4 py-2 rounded text-sm font-bold uppercase tracking-widest animate-pulse">
                  {hoverInfo.text}
              </div>
          </div>
      ) : null}

      {/* Dynamic Crosshair */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-difference z-10 transition-all duration-200 ${isAimingEnemy ? 'w-4 h-4 bg-red-500/80 scale-150' : 'w-2 h-2 bg-white/50'}`} />

      {/* Radio Message Subtitles */}
      {radioMessage ? (
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 pointer-events-none w-full flex justify-center">
              <div className="bg-black/80 border-l-4 border-green-500 py-3 px-6 rounded shadow-[0_0_15px_rgba(0,255,0,0.2)] max-w-2xl transform transition-all duration-300">
                  <p className="text-green-400 font-mono text-lg font-medium leading-relaxed uppercase tracking-wide flex items-center gap-3">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse inline-block" />
                      {radioMessage}
                  </p>
              </div>
          </div>
      ) : null}

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
            
            <div className="bg-black/70 border border-gray-600 p-3 rounded flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-yellow-900 flex items-center justify-center border border-yellow-500">
                    <div className="w-4 h-4 bg-yellow-500 rounded-full" />
                </div>
                <div>
                    <div className="text-xs text-yellow-400 font-bold">MINES [V]</div>
                    <div className="text-xl text-white font-mono">{mines}</div>
                </div>
            </div>

            {hasTurret ? (
                <div className="bg-black/70 border border-gray-600 p-3 rounded flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-900 flex items-center justify-center border border-blue-500">
                        <div className="w-4 h-4 bg-blue-500 rounded-full" />
                    </div>
                    <div>
                        <div className="text-xs text-blue-400 font-bold">TURRET</div>
                        <div className="text-xl text-white font-mono">{ammo}</div>
                    </div>
                </div>
            ) : null}

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

             {/* Dash Cooldown */}
            <div className="relative w-16 h-16">
                 <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r={radius} stroke="rgba(255,255,255,0.1)" strokeWidth="4" fill="transparent" />
                    <circle 
                        cx="32" cy="32" r={radius} 
                        stroke="orange" strokeWidth="4" fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        className="transition-all duration-200"
                        style={{ strokeLinecap: 'round', filter: `drop-shadow(0 0 5px orange)` }}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-white font-mono text-xs">
                    [SPACE]
                </div>
            </div>
         </div>

         <div className="flex flex-col gap-2">
             <div className={`w-64 bg-black/70 border ${battery < 20 ? 'border-red-500 animate-pulse' : 'border-gray-600'} p-2 rounded`}>
                <div className="flex justify-between text-xs text-gray-300 mb-1">
                    <span className={battery < 20 ? 'text-red-500 font-bold' : ''}>
                        {battery < 20 ? 'НИЗКИЙ ЗАРЯД' : 'ЗАРЯД ФОНАРЯ'}
                    </span>
                    <span className={battery < 20 ? 'text-red-500 font-bold' : ''}>{battery.toFixed(0)}%</span>
                </div>
                <div className="h-3 w-full bg-gray-800 rounded overflow-hidden">
                    <div 
                        className={`h-full ${batteryColor}`} 
                        style={{ width: `${batteryWidth}%` }}
                    />
                </div>
             </div>
             
             <div className="w-64 bg-black/70 border border-gray-600 p-2 rounded flex justify-between items-center">
                <span className="text-xs text-gray-400 font-bold">РЕЖИМ ФОНАРЯ [X]</span>
                <span className={`text-sm font-bold font-mono ${flashlightMode === FlashlightMode.UV ? 'text-purple-400' : flashlightMode === FlashlightMode.STROBE ? 'text-yellow-400' : 'text-white'}`}>
                    {flashlightMode}
                </span>
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

      {/* Hit Marker */}
      {showHitMarker ? (
          <div className="absolute top-1/2 left-1/2 pointer-events-none hitmarker-anim">
              <div className="relative w-8 h-8">
                  <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white opacity-80" />
                  <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-white opacity-80" />
                  <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-white opacity-80" />
                  <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white opacity-80" />
              </div>
          </div>
      ) : null}
    </div>
  );
};

export default GameUI;
