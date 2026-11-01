// Device-local persistence, daily streak and the mistakes list.

const pad = n => String(n).padStart(2, "0");

// Local calendar date; toISOString() would give the UTC date.
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// JSON over localStorage; falls back to memory if storage is missing, blocked or full.
export function createStore(storage = globalThis.localStorage) {
  const memory = new Map();
  let usable = !!storage;
  return {
    get(key, fallback) {
      if (usable) {
        try {
          const raw = storage.getItem(key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch { usable = false; }
      }
      return memory.has(key) ? memory.get(key) : fallback;
    },
    set(key, value) {
      memory.set(key, value);
      if (usable) {
        try { storage.setItem(key, JSON.stringify(value)); } catch { usable = false; }
      }
    },
  };
}

function nextDay(date) {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + 1));
}

export function updateStreak(streak, today) {
  if (streak?.lastDate === today) return streak;
  const count = streak && nextDay(streak.lastDate) === today ? streak.count + 1 : 1;
  return { count, lastDate: today };
}

export function addMistakes(list, fresh) {
  return [...list, ...fresh].slice(-200);
}
