
import React, { useState } from 'react';
import { GamePhase } from '../types';
import PatchNotes from './PatchNotes';

interface MainMenuProps {
  phase: GamePhase;
  onStartGame: () => void;
  onStartTutorial: () => void;
  onContinueGame?: () => void;
  hasSave: boolean;
}

const MainMenu = ({ phase, onStartGame, onStartTutorial, onContinueGame, hasSave }: MainMenuProps) => {
  const [showLogs, setShowLogs] = useState(false);

  if (phase !== GamePhase.MENU) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center pointer-events-auto">
        {showLogs && <PatchNotes onClose={() => setShowLogs(false)} />}

        <div className="max-w-2xl w-full p-8 border border-green-900/50 bg-black/90 text-center relative overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-50"></div>
            <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-50"></div>
            
            <h1 className="text-6xl font-bold text-white tracking-[0.2em] mb-2 uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                Shadow Watcher
            </h1>
            <h2 className="text-xl text-green-600 font-mono tracking-widest mb-12 animate-pulse">
                СИСТЕМА НАБЛЮДЕНИЯ АКТИВНА
            </h2>

            <div className="space-y-6 text-gray-400 font-mono text-sm mb-12">
                <p>ОБЪЕКТ: СТОРОЖЕВАЯ БУДКА #404</p>
                <p>ЗАДАЧА: ЗАЩИТИТЬ ГЕНЕРАТОР ЛЮБОЙ ЦЕНОЙ</p>
                <div className="text-xs border-t border-b border-gray-800 py-4 mx-auto w-2/3">
                    <p className="mb-2 text-white">УПРАВЛЕНИЕ:</p>
                    <p>[WASD] - Движение</p>
                    <p>[SHIFT] - Бег</p>
                    <p>[ЛКМ] / [F] - Фонарь</p>
                    <p>[ПКМ] - Перегрузка</p>
                    <p>[G] - Флаер</p>
                    <p>[E] - Взаимодействие</p>
                </div>
            </div>

            <div className="flex flex-col gap-4 items-center">
                {hasSave && onContinueGame && (
                     <button 
                        onClick={onContinueGame}
                        className="group relative w-64 px-8 py-3 bg-transparent border-2 border-green-600 text-green-500 font-bold uppercase tracking-widest hover:bg-green-600 hover:text-black transition-all duration-300 animate-pulse"
                    >
                        <span className="relative z-10">Продолжить</span>
                    </button>
                )}

                <button 
                    onClick={onStartGame}
                    className="group relative w-64 px-8 py-3 bg-transparent border-2 border-gray-600 text-gray-400 font-bold uppercase tracking-widest hover:border-green-600 hover:text-white transition-all duration-300"
                >
                    <span className="relative z-10">{hasSave ? 'Новая Игра' : 'Начать смену'}</span>
                    <div className="absolute inset-0 bg-green-600/0 blur-lg group-hover:bg-green-600/20 transition-all"></div>
                </button>

                <button 
                    onClick={onStartTutorial}
                    className="group relative w-64 px-8 py-3 bg-transparent border-2 border-gray-600 text-gray-400 font-bold uppercase tracking-widest hover:border-yellow-600 hover:text-white transition-all duration-300"
                >
                    <span className="relative z-10">Обучение</span>
                    <div className="absolute inset-0 bg-yellow-600/0 blur-lg group-hover:bg-yellow-600/20 transition-all"></div>
                </button>

                <button 
                    onClick={() => setShowLogs(true)}
                    className="text-xs text-yellow-600 hover:text-yellow-400 tracking-widest border-b border-transparent hover:border-yellow-400 transition-all mt-2"
                >
                    [ СИСТЕМНЫЙ ЖУРНАЛ v1.5.0 ]
                </button>
            </div>
            
            <p className="mt-8 text-[10px] text-gray-700">v.1.5.0 REFORGED // SHADOW_ENGINE</p>
        </div>
    </div>
  );
};

export default MainMenu;
