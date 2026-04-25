
export enum FlashlightMode {
  NORMAL = 'NORMAL',
  UV = 'UV',
  STROBE = 'STROBE'
}

export enum GamePhase {
  MENU = 'MENU',
  TUTORIAL = 'TUTORIAL',
  NIGHT = 'NIGHT',
  DAY = 'DAY',
  GAME_OVER = 'GAME_OVER',
  PAUSED = 'PAUSED'
}

export enum EnemyType {
  NORMAL = 'Normal',
  FAST = 'Fast',
  TANK = 'Tank',
  SPLITTER = 'Splitter',
  GLITCHER = 'Glitcher',
  DRAINER = 'Drainer',
  PHANTOM = 'Phantom',
  SPITTER = 'Spitter',
  SHRIEKER = 'Shrieker',
  FOREST_HEART = 'ForestHeart',
  LEVIATHAN = 'Leviathan'
}

export interface UnlockCondition {
  type: 'wave' | 'kills' | 'boss_kill' | 'achievement';
  value: number | string;
}

export interface LoreEntry {
  id: string;
  title: string;
  content: string;
  unlockCondition: UnlockCondition;
  isRead?: boolean; // Runtime state
}

export interface EnemyIntel {
  id: string; // Must match EnemyType values roughly or be mapped
  type: EnemyType;
  name: string;
  description: string;
  hp: number;
  speed: string;
  weakness: string;
}

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  cost: number;
  level: number;
  maxLevel: number;
  effect: (val: number) => number;
}

export interface GameState {
  phase: GamePhase;
  wave: number;
  generatorHealth: number;
  batteryLevel: number;
  maxBattery: number;
  credits: number;
  enemiesKilled: number;
  totalKills: number; // Persistent across waves
  flares: number; // ADDED
  mines: number; // ADDED
}

export interface ScoreEntry {
  date: string;
  wave: number;
  kills: number;
}

export interface SaveData {
  wave: number;
  credits: number;
  totalKills: number;
  killsByType: Record<string, number>; // Track specific kills
  generatorHp: number;
  battery: number;
  flares: number; // ADDED
  mines: number; // ADDED
  turretAmmo: number;
  upgrades: { id: string; level: number }[]; // Minimal data to reconstruct upgrades
  date: string;
}
