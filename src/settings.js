// 設定とハイスコアを端末に保存する（プライベートモード等で保存できなくても動くようにする）
const KEY = 'spacewar.settings.v1';
const HI_KEY = 'spacewar.hiscore.v1';
const DEFAULTS = { quality: 'auto', control: 'stick', invertY: false, sound: true };

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, v) {
  try { localStorage.setItem(key, v); } catch { /* 保存できない環境では無視 */ }
}

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(read(KEY) || '{}') || {}; } catch { s = {}; }
  return { ...DEFAULTS, ...s };
}
export function saveSettings(s) { write(KEY, JSON.stringify(s)); }
export function loadHiScore() { return parseInt(read(HI_KEY) || '0', 10) || 0; }
export function saveHiScore(v) { write(HI_KEY, String(v)); }
