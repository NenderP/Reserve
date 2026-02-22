
import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import GameCanvas from './components/GameCanvas';
import UIOverlay from './components/UIOverlay';
import ComputerTerminal from './components/ComputerTerminal';
import MainMenu from './components/MainMenu';
import LoadingScreen from './components/LoadingScreen';
import GameOverScreen from './components/GameOverScreen';
import Jumpscare from './components/Jumpscare';
import { GamePhase, SaveData, Upgrade } from './types';
import { GameEngine } from './services/GameEngine';
import { SaveService } from './services/SaveService';
import { INITIAL_UPGRADES } from './constants';

function App() {
  const [phase, setPhase] = useState<GamePhase>(GamePhase.MENU);
  const [battery, setBattery] = useState(100);
  const [hp, setHp] = useState(100);
  const [wave, setWave] = useState(0);
  const [credits, setCredits] = useState(0);
  const [totalKills, setTotalKills] = useState(0);
  const [killsByType, setKillsByType] = useState<Record<string, number>>({});
  const [upgrades, setUpgrades] = useState<Upgrade[]>(INITIAL_UPGRADES); 
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<{isHovering: boolean, text: string}>({isHovering: false, text: ''});
  const [isGenDisabled, setIsGenDisabled] = useState(false);
  const [restartProgress, setRestartProgress] = useState(0);
  const [flares, setFlares] = useState(0); 
  const [ammo, setAmmo] = useState(200);
  const [stamina, setStamina] = useState(100);
  const [overchargeCooldown, setOverchargeCooldown] = useState(0);
  
  // Save System
  const [hasSave, setHasSave] = useState(false);
  const [initialSaveData, setInitialSaveData] = useState<SaveData | null>(null);

  // Game Over Logic
  const [showJumpscare, setShowJumpscare] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  // Loading State
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const loadingManager = useRef(new THREE.LoadingManager());
  
  const gameEngineRef = useRef<GameEngine | null>(null);

  // Init Check
  useEffect(() => {
    setHasSave(SaveService.hasSave());
  }, []);

  // Loading Manager
  useEffect(() => {
    loadingManager.current.onProgress = (url, itemsLoaded, itemsTotal) => {
        const progress = (itemsLoaded / itemsTotal) * 100;
        setLoadingProgress(progress);
    };

    loadingManager.current.onLoad = () => {
        setTimeout(() => {
            setIsLoading(false);
        }, 500);
    };
  }, []);

  // AUTO SAVE LOGIC
  useEffect(() => {
      if (phase === GamePhase.DAY) {
          const minimalUpgrades = upgrades.map(u => ({ id: u.id, level: u.level }));
          
          const saveData: SaveData = {
              wave: wave,
              credits: credits,
              totalKills: totalKills,
              killsByType: killsByType,
              generatorHp: hp,
              battery: battery,
              flares: flares, 
              upgrades: minimalUpgrades,
              date: new Date().toLocaleDateString()
          };
          SaveService.saveGame(saveData);
          setHasSave(true);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleStatsUpdate = useCallback((
      newBat: number, 
      newHp: number, 
      newWave: number, 
      newCredits: number,
      genDisabled: boolean,
      resProgress: number,
      kills: number,
      kByType: Record<string, number>,
      turretAmmo: number,
      newStamina: number,
      overcharge: number
  ) => {
    setBattery(newBat);
    setHp(newHp);
    setWave(newWave);
    setCredits(newCredits);
    setIsGenDisabled(genDisabled);
    setRestartProgress(resProgress);
    setTotalKills(kills);
    setKillsByType(kByType);
    setAmmo(turretAmmo);
    setStamina(newStamina);
    setOverchargeCooldown(overcharge);
    
    if (gameEngineRef.current) {
        setFlares((gameEngineRef.current as any).flaresCount); 
    }
  }, []);

  const handlePhaseChange = useCallback((newPhase: GamePhase) => {
      setPhase(newPhase);
  }, []);

  const handleInteract = useCallback((target: string) => {
      if (target === 'computer') {
          setIsTerminalOpen(true);
      }
  }, []);

  const handleHover = useCallback((isHovering: boolean, text: string) => {
      setHoverInfo({ isHovering, text });
  }, []);

  const handleStartGame = () => {
      SaveService.clearSave(); 
      setInitialSaveData(null);
      
      setUpgrades(INITIAL_UPGRADES);
      setBattery(100);
      setHp(100);
      setKillsByType({});
      setFlares(0);
      setAmmo(200);
      setStamina(100);
      setOverchargeCooldown(0);
      
      if (gameEngineRef.current) {
          gameEngineRef.current.resetGame(); 
          gameEngineRef.current.startNight();
      }
  };

  const handleContinueGame = () => {
      const data = SaveService.loadGame();
      if (data) {
          const loadedUpgrades = INITIAL_UPGRADES.map(initUp => {
              const savedUp = data.upgrades.find(u => u.id === initUp.id);
              if (savedUp) {
                  let currentCost = initUp.cost;
                  for(let i=1; i < savedUp.level; i++) {
                      currentCost = Math.floor(currentCost * 1.5);
                  }
                  return { ...initUp, level: savedUp.level, cost: currentCost };
              }
              return initUp;
          });
          
          setUpgrades(loadedUpgrades);
          setWave(data.wave);
          setCredits(data.credits);
          setHp(data.generatorHp);
          setBattery(data.battery);
          setTotalKills(data.totalKills);
          setKillsByType(data.killsByType || {});
          setFlares(data.flares || 0);
          
          setInitialSaveData(data);
          setPhase(GamePhase.DAY);

          if (gameEngineRef.current) {
               gameEngineRef.current.restoreState(data);
          }
      }
  };

  const startNextWave = () => {
      if (gameEngineRef.current) {
          gameEngineRef.current.startNight();
      }
  };

  const handleUpgrade = (id: string, cost: number) => {
      if (gameEngineRef.current) {
          gameEngineRef.current.upgradeSystem(id);
          gameEngineRef.current.deductCredits(cost);
          
          setUpgrades(prev => {
              const idx = prev.findIndex(u => u.id === id);
              if (idx === -1) return prev;
              const newUps = [...prev];
              
              if (id === 'flare_pack' || id === 'turret_ammo') {
                  newUps[idx] = {
                      ...newUps[idx],
                      level: newUps[idx].level + 1
                  };
              } else {
                  newUps[idx] = {
                      ...newUps[idx],
                      level: newUps[idx].level + 1,
                      cost: Math.floor(newUps[idx].cost * 1.5)
                  };
              }
              return newUps;
          });
          
          setFlares((gameEngineRef.current as any).flaresCount);
      }
  };

  const handleCloseTerminal = () => {
      setIsTerminalOpen(false);
      if (gameEngineRef.current) {
          gameEngineRef.current.closeUI();
      }
  };

  const handleDeathSequenceStart = useCallback(() => {
      setShowJumpscare(true);
      SaveService.clearSave(); 
      setHasSave(false);
  }, []);

  const handleJumpscareComplete = useCallback(() => {
      setShowJumpscare(false);
      setIsGameOver(true);
      setPhase(GamePhase.GAME_OVER);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">
      
      <LoadingScreen progress={loadingProgress} isVisible={isLoading} />

      <GameCanvas 
        loadingManager={loadingManager.current}
        onStatsUpdate={handleStatsUpdate} 
        onPhaseChange={handlePhaseChange}
        onInteract={handleInteract}
        onHover={handleHover}
        onDeathSequenceStart={handleDeathSequenceStart}
        gameEngineRef={gameEngineRef}
        initialData={initialSaveData}
      />
      
      {showJumpscare && (
          <Jumpscare onComplete={handleJumpscareComplete} />
      )}

      {isGameOver && (
          <GameOverScreen wave={wave} kills={totalKills} />
      )}

      {!isLoading && !showJumpscare && !isGameOver && (
        <>
          <MainMenu 
            phase={phase}
            onStartGame={handleStartGame}
            onContinueGame={handleContinueGame}
            hasSave={hasSave}
          />

          <UIOverlay 
            phase={phase} 
            battery={battery} 
            hp={hp} 
            wave={wave} 
            hoverInfo={hoverInfo}
            isGenDisabled={isGenDisabled}
            restartProgress={restartProgress}
            flares={flares}
            stamina={stamina}
            overchargeCooldown={overchargeCooldown}
          />

          <ComputerTerminal 
            phase={phase} 
            wave={wave}
            credits={credits}
            totalKills={totalKills}
            killsByType={killsByType}
            isOpen={isTerminalOpen}
            onStartNextWave={startNextWave}
            onClose={handleCloseTerminal}
            onUpgrade={handleUpgrade}
            upgrades={upgrades}
          />
        </>
      )}
    </div>
  );
}

export default App;
