// Saves to this browser's localStorage only. Every read and write is guarded:
// private windows and blocked storage just mean the game starts fresh.
const KEY = 'sunset-territory-save-v1';

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.v === 1 ? d : null;
  } catch { return null; }
}

export function saveGame(data) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, at: Date.now(), ...data })); return true; } catch { return false; }
}

export function clearGame() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

const SETTINGS = 'sunset-territory-settings-v1';
export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS)) || {}; } catch { return {}; }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch { /* storage blocked */ }
}
