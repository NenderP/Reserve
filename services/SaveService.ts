
import { SaveData } from '../types';

const SAVE_KEY = 'shadow_watcher_save_v1';

export const SaveService = {
  saveGame: (data: SaveData) => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      console.log(`[SaveService] Game saved. Wave: ${data.wave}`);
    } catch (e) {
      console.error("Failed to save game", e);
    }
  },

  loadGame: (): SaveData | null => {
    try {
      const data = localStorage.getItem(SAVE_KEY);
      if (!data) return null;
      return JSON.parse(data);
    } catch (e) {
      console.warn("Failed to load save data", e);
      return null;
    }
  },

  hasSave: (): boolean => {
    return !!localStorage.getItem(SAVE_KEY);
  },

  clearSave: () => {
    localStorage.removeItem(SAVE_KEY);
  }
};
