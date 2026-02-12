const listeners = new Set();

export function emitDataChanged() {
  for (const fn of listeners) {
    try { fn(); } catch {}
  }
}

export function onDataChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
