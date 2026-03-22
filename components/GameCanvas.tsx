
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GameEngine } from '../services/GameEngine';
import { GamePhase, SaveData, FlashlightMode } from '../types';

interface GameCanvasProps {
  loadingManager: THREE.LoadingManager;
  onStatsUpdate: (bat: number, hp: number, wave: number, credits: number, genDisabled: boolean, restartProgress: number, totalKills: number, killsByType: Record<string, number>, ammo: number, stamina: number, overcharge: number, dash: number, hitMarker: number, isAimingEnemy: boolean, isBloodMoon: boolean, nearestDist: number | null, fMode: FlashlightMode) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onInteract: (target: string) => void;
  onHover: (isHovering: boolean, text: string) => void;
  onDeathSequenceStart: () => void;
  gameEngineRef: React.MutableRefObject<GameEngine | null>;
  initialData?: SaveData | null;
}

const GameCanvas = ({ 
    loadingManager, onStatsUpdate, onPhaseChange, onInteract, onHover, onDeathSequenceStart, gameEngineRef, initialData 
}: GameCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && !gameEngineRef.current) {
      gameEngineRef.current = new GameEngine(
          containerRef.current, 
          loadingManager,
          initialData || null,
          onStatsUpdate, 
          onPhaseChange,
          onInteract,
          onHover,
          onDeathSequenceStart
      );
    }

    return () => {
       if (gameEngineRef.current) {
           gameEngineRef.current.dispose();
           gameEngineRef.current = null;
       }
    };
  }, [loadingManager, onStatsUpdate, onPhaseChange, onInteract, onHover, onDeathSequenceStart, gameEngineRef, initialData]);

  return <div ref={containerRef} className="absolute inset-0 z-0" />;
};

export default GameCanvas;
