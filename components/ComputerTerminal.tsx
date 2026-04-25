
import React, { useState, useEffect, useRef } from 'react';
import { GamePhase, Upgrade } from '../types';
import { LORE_DATA, BESTIARY_DATA } from '../constants';
import gsap from 'gsap';

interface ComputerTerminalProps {
  phase: GamePhase;
  wave: number;
  credits: number;
  totalKills: number; 
  killsByType: Record<string, number>; 
  onStartNextWave: () => void;
  onClose: () => void;
  onUpgrade: (id: string, cost: number) => void;
  isOpen: boolean;
  upgrades: Upgrade[]; // Receive upgrades from parent
}

const ComputerTerminal = ({ 
    phase, wave, credits, totalKills, killsByType, onStartNextWave, onClose, onUpgrade, isOpen, upgrades
}: ComputerTerminalProps) => {
  const [activeTab, setActiveTab] = useState<'status' | 'logs' | 'bestiary' | 'shop' | 'defense'>('status');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // GSAP Animation on Open
  useEffect(() => {
    if (isOpen && containerRef.current) {
        gsap.fromTo(containerRef.current, 
            { scale: 0, opacity: 0, y: 50 },
            { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.7)" }
        );
        // Reset selected log when opening
        setSelectedLogId(null);
    }
  }, [isOpen]);

  if (phase !== GamePhase.DAY || !isOpen) return null;

  const handleBuy = (upgradeId: string) => {
      const upgrade = upgrades.find(u => u.id === upgradeId);
      if (!upgrade) return;

      if (credits >= upgrade.cost && upgrade.level < upgrade.maxLevel) {
          onUpgrade(upgrade.id, upgrade.cost);
      }
  };

  const isUnlocked = (condition: any): boolean => {
      if (condition.type === 'wave') return wave >= (condition.value as number);
      if (condition.type === 'kills') return totalKills >= (condition.value as number);
      if (condition.type === 'boss_kill') {
          if (condition.value === 'Behemoth' || condition.value === 'Leviathan') {
              return !!killsByType['Leviathan'];
          }
          return wave >= 6; 
      }
      if (condition.type === 'achievement') return true; 
      return false;
  }

  // Logic for displaying active log
  const unlockedLore = LORE_DATA.filter(l => isUnlocked(l.unlockCondition));
  // If specific log selected, show it. Otherwise show the latest unlocked one.
  const activeLoreEntry = selectedLogId 
      ? unlockedLore.find(l => l.id === selectedLogId) 
      : (unlockedLore.length > 0 ? unlockedLore[unlockedLore.length - 1] : null);

  return (
    <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div ref={containerRef} className="relative w-full max-w-5xl h-[650px] bg-[#0a0a0a] border-4 border-[#333] rounded-lg shadow-2xl overflow-hidden crt flex flex-col font-mono text-[#33ff33]">
        <div className="scanline"></div>
        
        {/* Header */}
        <div className="bg-[#111] p-2 border-b border-[#33ff33]/30 flex justify-between items-center">
            <span className="text-sm">TERMINAL_OS v3.13 [SECURE CONNECTION]</span>
            <div className="flex gap-4">
                <span className="text-yellow-400 font-bold">CREDITS: {credits}</span>
                <span className="text-sm animate-pulse text-red-400">ALERT LEVEL: {wave}</span>
            </div>
        </div>

        {/* Navbar */}
        <div className="flex border-b border-[#33ff33]/30">
            {[
                { id: 'status', label: 'СТАТУС' },
                { id: 'logs', label: 'АРХИВ' },
                { id: 'bestiary', label: 'БЕСТИАРИЙ' },
                { id: 'shop', label: 'МАГАЗИН' },
                { id: 'defense', label: 'ОБОРОНА' }
            ].map(tab => (
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 p-2 text-center hover:bg-[#33ff33]/20 border-r border-[#33ff33]/10 transition-colors ${activeTab === tab.id ? 'bg-[#33ff33]/20 font-bold text-white' : ''}`}
                >
                    [ {tab.label} ]
                </button>
            ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
            {activeTab === 'status' && (
                <div className="space-y-6">
                    <div className="border border-[#33ff33] p-4 bg-[#001100]">
                        <h2 className="text-2xl border-b border-[#33ff33] pb-2 mb-4 font-bold">ОТЧЕТ ЗА СМЕНУ #{wave}</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[#33ff33]/70">Статус периметра:</p>
                                <p className="text-xl">ЗАЧИЩЕН</p>
                            </div>
                            <div>
                                <p className="text-[#33ff33]/70">Устранено целей:</p>
                                <p className="text-xl">{totalKills}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                         <div className="col-span-1 p-4 border border-dashed border-[#33ff33]/50">
                             <h3 className="mb-2 font-bold">ТАКТИЧЕСКАЯ СВОДКА</h3>
                             <p className="text-sm mb-2">- Враги эволюционируют каждые 2 волны.</p>
                             <p className="text-sm mb-2">- Свет — ваше единственное оружие и защита.</p>
                             <p className="text-sm">- Обновляйте оборудование перед ночью.</p>
                         </div>
                         <div className="col-span-2 p-4 border border-dashed border-[#33ff33]/50">
                             <h3 className="mb-2 font-bold text-red-400">ВНИМАНИЕ ОПЕРАТОРУ</h3>
                             <p className="text-sm typing-effect">
                                 Обнаружены аномалии в поведении фауны. Рекомендуется изучить раздел [АРХИВ] для получения инструкций по выживанию. Запись "Проект Тень" содержит критическую информацию.
                             </p>
                         </div>
                    </div>
                </div>
            )}

            {activeTab === 'logs' && (
                <div className="grid grid-cols-3 gap-6 h-full">
                    <div className="col-span-1 border-r border-[#33ff33]/30 pr-4 overflow-y-auto">
                        <h3 className="text-xs text-[#33ff33]/50 mb-2">ДОСТУПНЫЕ ФАЙЛЫ</h3>
                        {LORE_DATA.map((lore, idx) => {
                            const unlocked = isUnlocked(lore.unlockCondition);
                            const isActive = activeLoreEntry?.id === lore.id;
                            return (
                                <div 
                                    key={lore.id} 
                                    onClick={() => unlocked && setSelectedLogId(lore.id)}
                                    className={`p-2 mb-1 text-sm border-b border-[#33ff33]/10 transition-colors
                                        ${unlocked ? 'hover:bg-[#33ff33]/10 cursor-pointer' : 'opacity-30 cursor-not-allowed'}
                                        ${isActive ? 'bg-[#33ff33]/20 text-white font-bold' : ''}
                                    `}
                                >
                                    {unlocked ? (
                                        <span>{'>'} {lore.title}</span>
                                    ) : (
                                        <span>{'>'} [ДАННЫЕ ЗАШИФРОВАНЫ]</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="col-span-2">
                        {activeLoreEntry ? (
                            <div className="h-full border border-[#33ff33]/20 p-4 bg-black/20">
                                <div className="flex justify-between items-center mb-4 border-b border-[#33ff33]/30 pb-2">
                                    <h3 className="text-xl font-bold text-white">{activeLoreEntry.title}</h3>
                                    <span className="text-xs border border-red-500 text-red-500 px-2 py-0.5 rounded">TOP SECRET</span>
                                </div>
                                <p className="leading-relaxed whitespace-pre-line text-sm text-[#ccffcc]">
                                    {activeLoreEntry.content}
                                </p>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-[#33ff33]/30">
                                <p>НЕТ РАСШИФРОВАННЫХ ДАННЫХ</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'bestiary' && (
                <div className="grid grid-cols-2 gap-4">
                    {BESTIARY_DATA.map(intel => {
                        // Fix for Case Sensitivity: EnemyType is Capitalized (Normal), ID is lowercase (normal)
                        const enemyTypeKey = Object.keys(killsByType).find(k => k.toLowerCase() === intel.id.toLowerCase());
                        const kills = enemyTypeKey ? killsByType[enemyTypeKey] : 0;
                        
                        // Unlock if kills > 0 OR manually unlocked via logic (e.g., boss)
                        const unlocked = kills > 0;
                        
                        if (!unlocked) {
                           return (
                               <div key={intel.id} className="border border-red-900 bg-red-900/5 p-4 flex flex-col items-center justify-center opacity-70">
                                   <div className="text-4xl text-red-800 mb-2">?</div>
                                   <h3 className="font-bold text-lg text-red-800 mb-1">ОБЪЕКТ НЕИЗВЕСТЕН</h3>
                                   <p className="text-xs text-red-500 uppercase tracking-widest border border-red-800 px-2 py-1">
                                       ТРЕБУЕТСЯ УСТРАНЕНИЕ
                                   </p>
                                   <div className="mt-4 w-full h-20 bg-black/50 flex items-center justify-center">
                                       <span className="text-[10px] text-red-900 animate-pulse">ДАННЫЕ ЗАШИФРОВАНЫ</span>
                                   </div>
                               </div>
                           )
                        }

                        return (
                            <div key={intel.id} className="border border-[#33ff33] bg-[#33ff33]/5 p-4 relative">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-lg">{intel.name}</h3>
                                    <span className="text-xs bg-[#33ff33]/20 px-2 py-1 rounded">HP: {intel.hp}</span>
                                </div>
                                <p className="text-sm mb-4 h-16">{intel.description}</p>
                                <div className="grid grid-cols-2 gap-2 text-xs border-t border-[#33ff33]/20 pt-2">
                                    <div>
                                        <span className="text-[#33ff33]/50">СКОРОСТЬ:</span> <span className="text-white">{intel.speed}</span>
                                    </div>
                                    <div>
                                        <span className="text-[#33ff33]/50">УЯЗВИМОСТЬ:</span> <span className="text-yellow-400">{intel.weakness}</span>
                                    </div>
                                </div>
                                <div className="absolute top-2 right-2 text-[10px] text-[#33ff33]/40">
                                    ELIMINATED: {kills}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {activeTab === 'shop' && (
                <div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {upgrades.filter(up => {
                            if (up.id === 'turret_ammo') {
                                const turretBuild = upgrades.find(u => u.id === 'turret_build');
                                return turretBuild && turretBuild.level > 0;
                            }
                            return true;
                        }).map(up => (
                            <div key={up.id} className="border border-[#33ff33]/50 p-4 hover:bg-[#33ff33]/10 transition-colors relative group">
                                <div className="flex justify-between mb-2">
                                    <span className="font-bold text-white group-hover:text-[#33ff33] transition-colors">{up.name}</span>
                                    <span className="font-mono">LVL {up.level} <span className="text-[#33ff33]/40">/ {up.maxLevel}</span></span>
                                </div>
                                <p className="text-xs text-[#33ff33]/70 mb-4 h-8">{up.description}</p>
                                <div className="flex justify-between items-center mt-auto">
                                    <span className={`font-bold ${credits < up.cost ? "text-red-500" : "text-yellow-400"}`}>
                                        {up.level >= up.maxLevel ? "MAXED" : `${up.cost} CR`}
                                    </span>
                                    <button 
                                        onClick={() => handleBuy(up.id)}
                                        className={`px-4 py-1 font-bold text-sm border transition-all ${
                                            credits >= up.cost && up.level < up.maxLevel 
                                            ? "border-[#33ff33] bg-[#33ff33]/20 hover:bg-[#33ff33] hover:text-black" 
                                            : "border-gray-600 text-gray-600 cursor-not-allowed bg-black"
                                        }`}
                                        disabled={credits < up.cost || up.level >= up.maxLevel}
                                    >
                                        {up.level >= up.maxLevel ? "INSTALLED" : "UPGRADE"}
                                    </button>
                                </div>
                            </div>
                        ))}
                     </div>
                </div>
            )}
            
            {activeTab === 'defense' && (
                <div className="flex flex-col h-full">
                    <div className="bg-red-900/10 border border-red-500 p-6 mb-4 flex items-center gap-6">
                        <div className="text-6xl text-red-500">⚠</div>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">SENTRY TURRET SYSTEM</h2>
                            <p className="text-sm text-red-300">Автоматическая система обороны крыши. Требует боеприпасы.</p>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                        <div className="border border-[#33ff33]/50 p-6 flex flex-col items-center justify-center bg-black/40">
                            <h3 className="font-bold text-xl mb-4">БОЕЗАПАС</h3>
                            <div className="text-6xl font-mono text-yellow-400 mb-2">
                                {/* This will be updated on next open, currently static in UI but functional */}
                                [AMMO]
                            </div>
                            <span className="text-xs text-gray-500">ROUNDS REMAINING</span>
                        </div>
                        
                        <div className="border border-[#33ff33]/50 p-6 flex flex-col justify-between">
                            <div>
                                <h3 className="font-bold text-lg text-white mb-2">ПОПОЛНЕНИЕ БОЕЗАПАСА</h3>
                                <p className="text-xs text-gray-400 mb-4">Коробка с патронами калибра 7.62 (100 шт).</p>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className={`font-bold text-xl ${credits < 150 ? "text-red-500" : "text-yellow-400"}`}>150 CR</span>
                                <button 
                                    onClick={() => onUpgrade('turret_ammo', 150)}
                                    className={`px-6 py-2 font-bold text-sm border transition-all ${
                                        credits >= 150
                                        ? "border-[#33ff33] bg-[#33ff33]/20 hover:bg-[#33ff33] hover:text-black" 
                                        : "border-gray-600 text-gray-600 cursor-not-allowed bg-black"
                                    }`}
                                    disabled={credits < 150}
                                >
                                    КУПИТЬ
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#33ff33]/30 flex justify-between bg-[#111]">
            <button 
                onClick={onClose}
                className="px-6 py-3 border border-red-900 text-red-500 hover:bg-red-900/20 font-bold transition-colors"
            >
                ОТКЛЮЧИТЬСЯ
            </button>
            <button 
                onClick={() => { onStartNextWave(); onClose(); }}
                className="px-8 py-3 bg-[#33ff33] text-black font-bold text-lg hover:bg-white hover:scale-105 transition-all shadow-[0_0_15px_rgba(51,255,51,0.5)]"
            >
                НАЧАТЬ СМЕНУ #{wave + 1}
            </button>
        </div>
      </div>
    </div>
  );
};

export default ComputerTerminal;
