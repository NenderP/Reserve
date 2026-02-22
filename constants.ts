
import { GAME_DATA } from './game_data';
import { LoreEntry, EnemyIntel } from './types';

export const COLORS = {
  FOG: 0x050505, // Night Fog
  SKY_NIGHT: 0x020205,
  SKY_DAY: 0x87CEEB,
  FOG_DAY: 0x87CEEB,
  LIGHT: 0xffffee, // Warm halogen look
  FLARE: 0xff3333, // Red Flare
  LIGHTNING: 0xaaccff, // Cold lightning
  BLOOD_MOON: 0x550000, // New Event Color
  GENERATOR_SAFE: 0x00ff00,
  GENERATOR_DAMAGED: 0xff0000,
  TERMINAL_BG: 0x0a0a0a,
  TERMINAL_TEXT: 0x33ff33,
};

export const GAME_CONFIG = {
  MAX_BATTERY: 100,
  BATTERY_DRAIN_RATE: 8.0,
  BATTERY_RECHARGE_RATE: 25.0,
  GENERATOR_MAX_HEALTH: 100,
  SAFE_ZONE_RADIUS: 3.5,
  PLAYER_SPEED: 2.2, // Reduced from 2.5
  PLAYER_RUN_SPEED: 3.8, // Reduced from 4.5
  MAX_FLARES: 5,
  FLARE_DURATION: 12.0,
  FLARE_RADIUS: 8.0,
  FLARE_COST: 100
};

export const LOADING_TIPS = [
  "Свет — ваше единственное оружие. Тьма убивает.",
  "Генератор привлекает их. Не отходите далеко.",
  "Если фонарь начал мигать — бегите.",
  "Некоторые тени можно увидеть только боковым зрением.",
  "Батарея восстанавливается только внутри будки.",
  "Они учатся. Каждая волна сложнее предыдущей.",
  "Звуки леса могут быть обманчивы.",
  "Следите за индикатором заряда. Полная темнота = смерть.",
  "Обновляйте оборудование в терминале, чтобы выжить.",
  "Вы не одни в этом лесу.",
  "Используйте [G], чтобы бросить флаер и осветить зону.",
  "Во время грозы вспышки молний могут выдать позицию врага."
];

// Cast JSON data to types
export const LORE_DATA: LoreEntry[] = GAME_DATA.lore as any;
export const BESTIARY_DATA: EnemyIntel[] = GAME_DATA.bestiary as any;

export const INITIAL_UPGRADES = [
  { 
    id: 'battery_cap', 
    name: 'High Capacity Battery', 
    description: 'Новый литий-ионный блок. Значительно замедляет разряд.', 
    cost: 50, 
    level: 1, 
    maxLevel: 5,
    effect: (val: number) => val // logic handled in engine
  },
  { 
    id: 'focus_lens', 
    name: 'Focus Lens', 
    description: 'Полимеризованная линза. Усиливает ожог сетчатки врагов.', 
    cost: 80, 
    level: 1, 
    maxLevel: 5,
    effect: (val: number) => val 
  },
  { 
    id: 'gen_reinforce', 
    name: 'Reinforced Generator', 
    description: 'Титановые пластины для корпуса генератора.', 
    cost: 120, 
    level: 1, 
    maxLevel: 3,
    effect: (val: number) => val 
  },
  {
    id: 'gen_auto_repair',
    name: 'Nanobot Repair Sys',
    description: 'Автоматическое восстановление корпуса генератора в дневное время.',
    cost: 200,
    level: 0,
    maxLevel: 1,
    effect: (val: number) => val
  },
  {
    id: 'flare_pack',
    name: 'UV Flare Pack (+1)',
    description: 'Комплект аварийных флаеров. Нажмите [G] для использования.',
    cost: 100, // Rebuyable
    level: 0,
    maxLevel: 99, // Infinite rebuy
    effect: (val: number) => val
  },
  {
    id: 'turret_ammo',
    name: 'Sentry Ammo Box',
    description: 'Коробка патронов для автоматической турели (100 шт).',
    cost: 150,
    level: 0,
    maxLevel: 99,
    effect: (val: number) => val
  }
];
