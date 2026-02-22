import { ScoreEntry } from '../types';

const STORAGE_KEY = 'shadow_watcher_leaderboard';
const MAX_ENTRIES = 10;

export const LeaderboardService = {
  getScores: (): ScoreEntry[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn("Failed to load leaderboard", e);
      return [];
    }
  },

  addScore: (wave: number, kills: number) => {
    const scores = LeaderboardService.getScores();
    
    const newEntry: ScoreEntry = {
      date: new Date().toLocaleDateString(),
      wave,
      kills
    };

    scores.push(newEntry);

    // Sort: Higher Wave first, then Higher Kills
    scores.sort((a, b) => {
      if (b.wave !== a.wave) return b.wave - a.wave;
      return b.kills - a.kills;
    });

    // Keep top N
    const topScores = scores.slice(0, MAX_ENTRIES);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(topScores));
    } catch (e) {
      console.warn("Failed to save score", e);
    }

    return topScores;
  }
};