
import React from 'react';

interface PatchNotesProps {
  onClose: () => void;
}

const PatchNotes: React.FC<PatchNotesProps> = ({ onClose }) => {
  return (
    <div className="absolute inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="max-w-2xl w-full border-2 border-green-600 bg-[#0a0a0a] p-6 relative crt font-mono text-green-500 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
        
        <div className="flex justify-between items-center mb-6 border-b border-green-600/50 pb-2">
            <h2 className="text-2xl font-bold tracking-widest text-white">REFORGED: v1.5.0</h2>
            <span className="text-xs border border-green-600 px-2 py-1 animate-pulse bg-green-900/20">STABLE</span>
        </div>
        
        <div className="space-y-6 text-sm mb-8 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
          
          <div className="bg-cyan-900/10 p-4 border-l-2 border-cyan-600">
            <h3 className="text-cyan-400 font-bold mb-2 flex items-center gap-2">
                <span>[GRAPHICS]</span> VISUAL OVERHAUL
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-cyan-400/80">
              <li><span className="text-white">Освещение:</span> Система рендеринга переведена на ACES Filmic для более кинематографичной и реалистичной картинки.</li>
              <li><span className="text-white">Трава:</span> Полностью переработана. Теперь это густая растительность с детализированными текстурами и вариациями цвета.</li>
              <li><span className="text-white">Окружение:</span> Улучшены текстуры земли и стволов деревьев для большего погружения.</li>
            </ul>
          </div>

          <div className="bg-yellow-900/10 p-4 border-l-2 border-yellow-600">
            <h3 className="text-yellow-400 font-bold mb-2 flex items-center gap-2">
                <span>[GAMEPLAY]</span> OVERCHARGE FIX
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-yellow-400/80">
              <li><span className="text-white">ИСПРАВЛЕНО:</span> Механика "Перегрузки" [ПКМ] теперь корректно наносит урон и оглушает врагов в широком конусе.</li>
              <li><span className="text-white">UI:</span> Добавлен круговой индикатор перезарядки способности в HUD.</li>
               <li><span className="text-white">ЭФФЕКТ:</span> Улучшен визуальный эффект вспышки для лучшего отклика.</li>
            </ul>
          </div>

        </div>

        <button 
          onClick={onClose}
          className="group w-full py-3 border border-green-600 hover:bg-green-600 hover:text-black transition-all font-bold uppercase tracking-widest"
        >
          <span className="group-hover:hidden">ЗАГРУЗИТЬ ОБНОВЛЕНИЕ</span>
          <span className="hidden group-hover:inline">СИСТЕМА ОБНОВЛЕНА</span>
        </button>
        
        <div className="absolute bottom-2 right-2 text-[10px] text-green-900">
            BUILD_HASH: REFORGED_REL
        </div>
      </div>
    </div>
  );
};

export default PatchNotes;
